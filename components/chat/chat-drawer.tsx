"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, MoreVertical, Plus, Mic, ArrowUp, Sparkles, Zap, Trash2, SquarePen, ImagePlus, X } from "lucide-react";
import { useUIStore } from "@/lib/store";
import { setPendingAction } from "@/lib/pending-actions";
import {
  useAccountStore,
  selectUsage,
  shouldGateAuth,
  type AccountState,
} from "@/lib/account-store";
import { MODELS } from "@/lib/ai-config";
import { getDeviceId } from "@/lib/auth";
import { trackEvent } from "@/lib/analytics";
import { Sparkle } from "@/components/ui/sparkle";
import { RecommendationCards } from "./recommendation-cards";
import { CompanionAvatar } from "@/components/ui/companion-avatar";
import { FloatingChatPlayer } from "./floating-chat-player";
import { MessageBubble } from "./message-bubble";
import { NotificationPrompt } from "@/components/notification-prompt";
import { loadPushState } from "@/lib/notifications";
import type { ChatMessage, ChatSessionSummary } from "@/lib/types";
import { getDeviceId } from "@/lib/device-id";
import { cn } from "@/lib/utils";

// crypto.randomUUID() requires a secure context (HTTPS). Fall back to a
// Math.random-based id when running over plain HTTP (e.g. dev/Oracle VM).
const genId = () =>
  (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

function makeGreeting(assistantName: string): ChatMessage {
  return {
    id: "greeting",
    role: "assistant",
    content: `Hey, I'm ${assistantName}, your movie companion. What are you in the mood to watch tonight?`,
  };
}

const CHAT_STORAGE_KEY = "dxb:chat-sessions";

interface StoredChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

function summarizeSession(session: StoredChatSession): ChatSessionSummary {
  return {
    id: session.id,
    title: session.title,
    timeAgo: formatTimeAgo(session.updatedAt),
  };
}

function formatTimeAgo(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function getSessionTitle(messages: ChatMessage[], movieContextTitle?: string | null) {
  return (
    messages.find((message) => message.role === "user")?.content.slice(0, 48) ??
    movieContextTitle ??
    "New conversation"
  );
}

/**
 * Gemini-style chat drawer with animated gradient background, pill input bar,
 * and a centred empty state greeting.
 */
export function ChatDrawer() {
  const open = useUIStore((s) => s.chatOpen);
  const close = useUIStore((s) => s.closeChat);
  const movieContext = useUIStore((s) => s.chatMovieContext);
  const openAuthGate = useUIStore((s) => s.openAuthGate);

  // Account/usage snapshot (primitive selects → safe, reactive).
  const signedIn = useAccountStore((s) => s.signedIn);
  const aiCompanion = useAccountStore((s) => s.aiCompanion);
  const hasSentFirst = useAccountStore((s) => s.hasSentFirst);
  const freeUsed = useAccountStore((s) => s.freeUsed);
  const windowStart = useAccountStore((s) => s.windowStart);

  const usage = selectUsage({
    signedIn,
    hasSentFirst,
    freeUsed,
    windowStart,
  } as AccountState);

  const assistantName = !signedIn || !aiCompanion ? "DXBmovies" : aiCompanion.name;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachedImageDataUrl, setAttachedImageDataUrl] = useState<string | null>(null);
  const [attachedImageName, setAttachedImageName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [sessions, setSessions] = useState<StoredChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showVoiceIntro, setShowVoiceIntro] = useState(false);
  const [aiRecording, setAiRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevSessionId = useRef(activeSessionId);
  const menuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const draftRef = useRef(draft);
  const voiceTranscriptRef = useRef("");
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Handle Proactive Voice Greeting (once per 24 hours per device)
  useEffect(() => {
    if (!open) return;
    
    const lastIntro = localStorage.getItem("dxb:last-voice-intro");
    const now = Date.now();
    // Only trigger if no greeting in the last 24 hours
    if (lastIntro && now - parseInt(lastIntro, 10) < 24 * 60 * 60 * 1000) {
      return;
    }

    let isCancelled = false;

    // Play a tiny native beep sound to grab attention
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = "sine";
      oscillator.frequency.value = 600; // soft beep
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
      console.error("AudioContext beep failed", e);
    }

    setAiRecording(true);

    const timer = setTimeout(async () => {
      if (isCancelled) return;

      const greetings = [
        "Hello there, how are you doing?",
        "Hey! What are you in the mood to watch today?",
        "Hi there! Looking for a good movie recommendation?",
        "Hello! I have a beautiful movie to recommend for you today if you're interested?",
        "Hey! Need help deciding what to watch tonight?",
        "Hi there, I can find the perfect movie for your mood. What are you thinking?",
        "Greetings! Ready to discover something amazing?",
      ];
      const text = greetings[Math.floor(Math.random() * greetings.length)];

      try {
        const firstVisitStr = localStorage.getItem("dxb:first-visit-time");
        let firstVisitTime = firstVisitStr ? parseInt(firstVisitStr, 10) : 0;
        
        if (!firstVisitTime) {
          firstVisitTime = Date.now();
          localStorage.setItem("dxb:first-visit-time", firstVisitTime.toString());
        }

        const hoursSinceFirstVisit = (Date.now() - firstVisitTime) / (1000 * 60 * 60);

        if (hoursSinceFirstVisit > 24) {
          // More than 24 hours since they first visited. Fall back to just appending the text without ElevenLabs voice.
          setMessages((prev) => {
            if (prev.length > 0) return prev;
            return [
              ...prev,
              {
                id: `msg-${Date.now()}`,
                role: "assistant",
                content: text,
                timestamp: Date.now(),
              },
            ];
          });
          return;
        }

        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            text, 
            gender: aiCompanion?.gender ?? "female" 
          }),
        });
        
        if (!res.ok) throw new Error("TTS fetch failed");
        
        const blob = await res.blob();
        const audioUrl = URL.createObjectURL(blob);
        
        if (isCancelled) {
          URL.revokeObjectURL(audioUrl);
          return;
        }

        // Only append if they haven't sent a message yet
        setMessages((prev) => {
          if (prev.length > 0) {
            URL.revokeObjectURL(audioUrl);
            return prev;
          }
          localStorage.setItem("dxb:last-voice-intro", Date.now().toString());
          return [
            ...prev,
            {
              id: `msg-${Date.now()}`,
              role: "assistant",
              content: text,
              audioUrl,
              timestamp: Date.now(),
            },
          ];
        });
      } catch (error) {
        console.error("Proactive greeting failed:", error);
      } finally {
        if (!isCancelled) setAiRecording(false);
      }
    }, 5000);

    return () => {
      isCancelled = true;
      setAiRecording(false);
      clearTimeout(timer);
    };
  }, [open, aiCompanion?.gender]);

  // Load sessions: try server first for signed-in users, fallback to localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;

    async function loadSessions() {
      if (signedIn) {
        try {
          const res = await fetch("/api/user/conversations");
          if (res.ok) {
            const serverSessions = await res.json();
            if (Array.isArray(serverSessions) && serverSessions.length > 0) {
              const mapped: StoredChatSession[] = serverSessions.map((s: { id: string; title: string; updatedAt: number; messages: ChatMessage[] }) => ({
                id: s.id,
                title: s.title,
                updatedAt: s.updatedAt,
                messages: s.messages,
              }));
              setSessions(mapped);
              localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(mapped));
              return;
            }
          }
        } catch {
          // Fall through to localStorage.
        }
      }

      // Fallback: load from localStorage.
      try {
        const raw = localStorage.getItem(`dxb:chat-sessions:${getDeviceId()}`);
        if (!raw) {
          // Check for legacy global key to migrate
          const legacyRaw = localStorage.getItem("dxb:chat-sessions");
          if (legacyRaw) {
             const parsed = JSON.parse(legacyRaw) as StoredChatSession[];
             if (Array.isArray(parsed)) setSessions(parsed);
          }
          return;
        }
        const parsed = JSON.parse(raw) as StoredChatSession[];
        if (Array.isArray(parsed)) setSessions(parsed);
      } catch {
        // Ignore malformed local data.
      }
    }

    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist sessions to localStorage whenever they change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(`dxb:chat-sessions:${getDeviceId()}`, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  const autoSendTriggered = useRef<string | null>(null);

  // When opened with a movie context ("Ask AI about this"), auto-send a prompt with the cover.
  useEffect(() => {
    if (open && movieContext && autoSendTriggered.current !== movieContext.title) {
      autoSendTriggered.current = movieContext.title;
      const text = `Tell me about ${movieContext.title}`;
      const imgUrl = movieContext.posterPath ? `https://image.tmdb.org/t/p/w342${movieContext.posterPath}` : null;
      // Small timeout to allow drawer animation to start and state to settle
      setTimeout(() => attemptSend(text, imgUrl), 150);
    } else if (!open) {
      autoSendTriggered.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, movieContext]);

  // Auto-scroll to newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);



  useEffect(() => {
    const hasConversation = messages.some((message) => message.role === "user");
    if (!hasConversation) return;

    const sessionId = activeSessionId ?? genId();
    const title = getSessionTitle(messages, movieContext?.title);
    const nextSession: StoredChatSession = {
      id: sessionId,
      title,
      updatedAt: Date.now(),
      messages,
    };

    setActiveSessionId(sessionId);
    setSessions((prev) => {
      const withoutCurrent = prev.filter((session) => session.id !== sessionId);
      return [nextSession, ...withoutCurrent].slice(0, 8);
    });

    // Persist to MongoDB for signed-in users (fire-and-forget).
    if (signedIn) {
      fetch("/api/user/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, title, messages }),
      }).catch(() => { /* localStorage is the fallback */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeSessionId, movieContext]);

  const pendingChatMessage = useUIStore((s) => s.pendingChatMessage);
  const setPendingChatMessage = useUIStore((s) => s.setPendingChatMessage);

  // If user was redirected back after sign-in, auto-send their recovered message.
  useEffect(() => {
    if (open && pendingChatMessage) {
      const text = pendingChatMessage;
      setPendingChatMessage(null);
      // Wait a tiny bit for UI to settle before sending
      setTimeout(() => {
        attemptSend(text, null);
      }, 300);
    }
  }, [open, pendingChatMessage, setPendingChatMessage]);

  if (!open) return null;

  const SUGGESTIONS = [
    "Recommend something for tonight",
    "I'm in the mood for action",
    "Something emotional and deep",
    "Surprise me 🎲",
  ];

  function handleSuggestion(text: string) {
    setShowSuggestions(false);
    attemptSend(text);
  }

  function startVoice() {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice recognition is not supported on this device/browser.");
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;
      voiceTranscriptRef.current = "";
      setRecordingSeconds(0);
      setIsListening(true);

      // Start a recording timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results).map((result: any) => result[0].transcript).join("");
        voiceTranscriptRef.current = transcript;
      };
      recognition.onerror = (e: any) => {
        console.error("Speech recognition error:", e.error);
        cleanupRecording();
      };
      recognition.onend = () => {
        // Don't cleanup here — stopVoice handles it
      };
      recognition.start();
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      cleanupRecording();
    }
  }

  function cleanupRecording() {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingSeconds(0);
    setIsListening(false);
  }

  function stopVoice() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      const transcript = voiceTranscriptRef.current.trim();
      if (transcript) {
        attemptSend(transcript, null);
      }
    }
    cleanupRecording();
  }

  function pickImage() {
    imageInputRef.current?.click();
  }

  function onImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      setAttachedImageDataUrl(result);
      setAttachedImageName(file.name);
    };
    reader.readAsDataURL(file);

    // Allow selecting the same file again later.
    event.target.value = "";
  }

  const topic =
    movieContext?.title ??
    messages.find((m) => m.role === "user")?.content?.slice(0, 40) ??
    "New conversation";

  const previousChats = sessions.map(summarizeSession);

  function resetComposer() {
    setDraft("");
    setShowSuggestions(false);
    setAttachedImageDataUrl(null);
    setAttachedImageName(null);
    setMenuOpen(false);
  }

  function startNewChat() {
    setMessages([]);
    setActiveSessionId(null);
    resetComposer();
  }

  function clearCurrentChat() {
    if (activeSessionId) {
      setSessions((prev) => prev.filter((session) => session.id !== activeSessionId));
    }
    setMessages([]);
    setActiveSessionId(null);
    resetComposer();
  }

  function openSession(sessionId: string) {
    const session = sessions.find((entry) => entry.id === sessionId);
    if (!session) return;
    setMessages(session.messages);
    setActiveSessionId(session.id);
    resetComposer();
  }

  function deleteSession(sessionId: string) {
    setSessions((prev) => prev.filter((session) => session.id !== sessionId));
    if (sessionId === activeSessionId) {
      setMessages([]);
      setActiveSessionId(null);
      resetComposer();
    }
  }

  function handleEditMessage(index: number) {
    const messageToEdit = messages[index];
    if (!messageToEdit || messageToEdit.role !== "user") return;
    
    // Set the draft to the message content
    setDraft(messageToEdit.content);
    
    // Trim messages to remove this message and everything after it
    setMessages((prev) => prev.slice(0, index));
    
    // Focus the textarea if possible
    textareaRef.current?.focus();
  }

  function attemptSend(text: string, imageDataUrl: string | null = null) {
    const value = text.trim();
    const hasImage = Boolean(imageDataUrl);
    if (!value && !hasImage) return;
    const outboundText = value || "Analyze this image and suggest what to watch.";

    const acct = useAccountStore.getState();

    // 1. Gmail sign-in gate — anonymous user past their first message.
    if (shouldGateAuth(acct)) {
      setPendingAction({ type: "open_chat", text: outboundText, movie: movieContext });
      setDraft("");
      localStorage.setItem("dxb_signup_source", "chat_limit");
      openAuthGate();
      return;
    }

    deliver(outboundText, !acct.hasSentFirst, imageDataUrl ?? null);
    // Reset textarea height
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
  }

  function deliver(text: string, isFirstEver: boolean, imageDataUrl: string | null) {
    const tier = isFirstEver ? "advanced" : "cheap";

    // Append user message and a loading placeholder
    const userMsg: ChatMessage = {
      id: genId(),
      role: "user",
      content: text === "Analyze this image and suggest what to watch." && imageDataUrl ? "Sent an image for analysis." : text,
      timestamp: Date.now(),
      ...(imageDataUrl ? { imageUrl: imageDataUrl } : {}),
    };
    const loadingId = genId();
    const loadingMsg: ChatMessage = { id: loadingId, role: "assistant", model: MODELS[tier].label, content: "…" };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setDraft("");
    setAttachedImageDataUrl(null);
    setAttachedImageName(null);

    useAccountStore.getState().recordSend();
    trackEvent("sonia_message_sent", { message_index: messages.length + 1 });

    // Build history for the API (all messages except the loading placeholder)
    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Tell server if user navigated away so it can send push
        "X-App-Backgrounded": document.hidden ? "true" : "false",
      },
      body: JSON.stringify({
        messages: history,
        movieContext: movieContext?.title ?? null,
        imageDataUrl,
        anonId: getDeviceId(),
      }),
    })
      .then((r) => r.json())
      .then(async (data: { content?: string; error?: string; recommendations?: import("@/lib/types").Movie[]; provider?: "groq" | "openai" }) => {
        const content = data.content ?? "Sorry, I hit a snag. Try asking again.";
        const recommendations = data.recommendations && data.recommendations.length > 0
          ? data.recommendations
          : undefined;
        const provider = data.provider;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingId ? { ...m, content, recommendations, provider, timestamp: Date.now() } : m,
          ),
        );
        // Show notification prompt after 2nd message if not yet decided
        const acct = useAccountStore.getState();
        if (acct.signedIn && acct.freeUsed >= 2) {
          const pushState = loadPushState();
          if (!pushState.decided) {
            setShowNotifPrompt(true);
          }
        }
      })
      .catch(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingId
              ? { ...m, content: "Network error. Please try again." }
              : m,
          ),
        );
      });
  }

  const modelInfo = MODELS[usage.tier];
  const hasMessages = messages.length > 0;
  const userName = signedIn ? useAccountStore.getState().email : null;

  return (
    <>
    <div className="fixed inset-0 z-[90]">
      {/* Overscroll/Keyboard background guard for iOS PWA */}
      <div className="absolute -inset-y-[100vh] inset-x-0 bg-[#050510] lg:hidden" />

      {/* Desktop scrim — clicking outside the docked panel closes it */}
      <button
        type="button"
        aria-label="Close chat"
        onClick={close}
        className="absolute inset-0 hidden bg-black/60 backdrop-blur-sm lg:block"
      />

      {/* Panel: full-screen slide-up on mobile, right-docked on desktop */}
      <div className="absolute inset-0 mx-auto flex max-w-app animate-slide-up flex-col lg:inset-y-0 lg:left-auto lg:right-0 lg:mx-0 lg:w-[440px] lg:animate-slide-in-right lg:border-l lg:border-white/[0.06]">

        {/* ─── Animated gradient background ─── */}
        <div
          className="absolute inset-0 animate-gemini-bg opacity-70"
          style={{
            background: "linear-gradient(135deg, rgba(76,29,149,0.4) 0%, rgba(30,58,138,0.4) 25%, rgba(15,118,110,0.4) 50%, rgba(180,83,9,0.4) 75%, rgba(76,29,149,0.4) 100%)",
            backgroundSize: "400% 400%",
          }}
        />
        {/* Radial overlay to deepen the center */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />

        {/* All content sits above the gradient */}
        <div className="relative z-10 flex h-full flex-col">
          {/* ─── Header ─── */}
          <header className="flex items-center gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <ChevronLeft size={24} />
            </button>
            <CompanionAvatar companion={signedIn ? aiCompanion : null} size={34} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">{assistantName}</p>
            </div>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-label="Menu"
                onClick={() => setMenuOpen((value) => !value)}
                className="grid h-10 w-10 place-items-center rounded-full text-white/50 transition hover:bg-white/5 hover:text-white"
              >
                <MoreVertical size={20} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-12 z-10 w-72 rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl p-2 shadow-2xl">
                  <button
                    type="button"
                    onClick={startNewChat}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-white transition hover:bg-white/10"
                  >
                    <SquarePen size={16} className="text-white/50" />
                    New chat
                  </button>
                  <button
                    type="button"
                    onClick={clearCurrentChat}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-rose-300 transition hover:bg-white/10"
                  >
                    <Trash2 size={16} className="text-rose-300" />
                    Clear current chat
                  </button>

                  <div className="mt-2 border-t border-white/10 pt-2">
                    <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/30">
                      Previous chats
                    </p>

                    {previousChats.length > 0 ? (
                      <div className="space-y-1">
                        {previousChats.map((session) => (
                          <div key={session.id} className="flex items-center gap-2 rounded-xl px-1 py-1 hover:bg-white/10">
                            <button
                              type="button"
                              onClick={() => openSession(session.id)}
                              className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left"
                            >
                              <p className="truncate text-sm text-white">{session.title}</p>
                              <p className="text-xs text-white/30">{session.timeAgo}</p>
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${session.title}`}
                              onClick={() => deleteSession(session.id)}
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/30 transition hover:bg-white/10 hover:text-rose-300"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="px-3 py-2 text-sm text-white/30">No previous chats yet.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* Floating PiP player for trailers inside chat */}
          <FloatingChatPlayer />

          {/* ─── Messages area ─── */}
          <div ref={scrollRef} className="flex-1 overflow-x-hidden overflow-y-auto px-4 py-5">
            {hasMessages || aiRecording ? (
              <div className="space-y-5">
                {messages.map((m, idx) => (
                  <MessageBubble 
                    key={m.id} 
                    message={m} 
                    onEdit={m.role === "user" ? () => handleEditMessage(idx) : undefined} 
                  />
                ))}
                
                {aiRecording && (
                  <div className="flex animate-message-in gap-3">
                    <CompanionAvatar companion={signedIn ? aiCompanion : null} size={28} className="mt-1 shrink-0" />
                    <div className="flex items-center gap-3 rounded-3xl bg-white/[0.08] px-5 py-3 backdrop-blur-md">
                      <Mic size={14} className="text-primary animate-pulse" />
                      <span className="text-[13px] font-medium text-white/80 tracking-wide">Recording</span>
                      <div className="flex items-center gap-1 mt-1">
                        <div className="h-1 w-1 animate-bounce rounded-full bg-white/50" style={{ animationDelay: "0ms" }} />
                        <div className="h-1 w-1 animate-bounce rounded-full bg-white/50" style={{ animationDelay: "150ms" }} />
                        <div className="h-1 w-1 animate-bounce rounded-full bg-white/50" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ─── Empty state ─── */
              <div className="flex h-full flex-col items-center justify-center px-6" />
            )}
          </div>

          {/* ─── Input bar ─── */}
          <div className="relative px-2 sm:px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              aria-label="Attach an image"
              className="hidden"
              onChange={onImageSelected}
            />

            {attachedImageDataUrl && !isListening && (
              <div className="mb-3 relative inline-block">
                <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-sm">
                  <Image
                    src={attachedImageDataUrl}
                    alt="Attached preview"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAttachedImageDataUrl(null);
                    setAttachedImageName(null);
                  }}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/80 border border-white/10 text-white/50 hover:text-white shadow-md transition-colors"
                  aria-label="Remove image"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Quick suggestion chips — shown on toggle */}
            {showSuggestions && !isListening && (
              <div className="mb-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSuggestion(s)}
                    className="rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {isListening ? (
              /* ─── Recording Overlay ─── */
              <div
                className="flex items-center gap-3 rounded-3xl bg-[#1C1C1E]/95 backdrop-blur-md px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.5)] ring-2 ring-red-500/60"
                onPointerUp={stopVoice}
              >
                {/* Pulsing red dot */}
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                  <div className="absolute h-10 w-10 animate-ping rounded-full bg-red-500/30" />
                  <div className="h-4 w-4 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.7)]" />
                </div>

                {/* Animated waveform bars */}
                <div className="flex items-center gap-[3px] flex-1">
                  {[...Array(16)].map((_, i) => (
                    <div
                      key={i}
                      className="w-[3px] rounded-full bg-white/60"
                      style={{
                        height: `${12 + Math.random() * 20}px`,
                        animation: `voiceBar 0.6s ease-in-out ${i * 0.05}s infinite alternate`,
                      }}
                    />
                  ))}
                </div>

                {/* Timer */}
                <span className="text-sm font-mono text-white/70 tabular-nums min-w-[40px] text-right">
                  {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}
                </span>

                {/* Stop button */}
                <button
                  type="button"
                  onClick={stopVoice}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500 text-white transition active:scale-90 shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                >
                  <ArrowUp size={20} />
                </button>

                <style jsx>{`
                  @keyframes voiceBar {
                    0% { height: 6px; }
                    100% { height: 28px; }
                  }
                `}</style>
              </div>
            ) : (
              /* ─── Normal text input ─── */
              <div className="flex items-end gap-2 rounded-3xl bg-[#1C1C1E]/90 backdrop-blur-md px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.5)] ring-1 ring-primary/40 focus-within:ring-2 focus-within:ring-primary transition-shadow">
                <button
                  type="button"
                  aria-label="Quick suggestions"
                  onClick={() => setShowSuggestions((v) => !v)}
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-full transition",
                    showSuggestions ? "text-primary" : "text-white/40 hover:text-white/70",
                  )}
                >
                  <Plus size={22} />
                </button>
                <textarea
                  ref={textareaRef}
                  value={draft}
                  rows={1}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      attemptSend(draft, attachedImageDataUrl);
                      e.currentTarget.style.height = "auto";
                    }
                  }}
                  placeholder="Ask DXB…"
                  className="min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-snug text-white placeholder:text-white/30 focus:outline-none"
                  style={{ maxHeight: "140px", overflowY: "auto" }}
                />
                <button
                  type="button"
                  aria-label="Attach image"
                  onClick={pickImage}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/40 transition hover:text-white/70"
                >
                  <ImagePlus size={20} />
                </button>
                {draft.trim() || attachedImageDataUrl ? (
                  <button
                    type="button"
                    onClick={() => attemptSend(draft, attachedImageDataUrl)}
                    aria-label="Send"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-primary text-white transition active:scale-95 shadow-glow"
                  >
                    <ArrowUp size={20} />
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="Hold to talk"
                    onPointerDown={startVoice}
                    onPointerUp={stopVoice}
                    onPointerLeave={stopVoice}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/40 transition hover:text-white/70"
                  >
                    <Mic size={20} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Notification permission prompt — shown after 2nd message */}
    {showNotifPrompt && <NotificationPrompt onDismiss={() => setShowNotifPrompt(false)} />}
    </>
  );
}
