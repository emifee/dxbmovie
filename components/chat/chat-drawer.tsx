"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, MoreVertical, Plus, Mic, ArrowUp, Sparkles, Zap, Trash2, SquarePen, ImagePlus, X } from "lucide-react";
import { useUIStore } from "@/lib/store";
import {
  useAccountStore,
  selectUsage,
  shouldGateAuth,
  type AccountState,
} from "@/lib/account-store";
import { MODELS } from "@/lib/ai-config";
import { Sparkle } from "@/components/ui/sparkle";
import { CompanionAvatar } from "@/components/ui/companion-avatar";
import { MessageBubble } from "./message-bubble";
import { NotificationPrompt } from "@/components/notification-prompt";
import { loadPushState } from "@/lib/notifications";
import type { ChatMessage, ChatSessionSummary } from "@/lib/types";
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
    content: `Hey there! 🎬 I'm ${assistantName}, your movie companion. What are you in the mood to watch tonight?`,
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
 * Chat drawer with sign-in gating and lightweight usage tracking. Flow:
 *   1. Anonymous user gets 1 message + reply free (advanced model).
 *   2. Sending the 2nd message opens the Gmail sign-in gate; on success the
 *      preserved message auto-sends.
 *   3. Messages continue on the free platform model mix after sign-in.
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

  const assistantName = !signedIn || !aiCompanion ? "DXBmovies AI" : aiCompanion.name;

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingDraft = useRef<string | null>(null);
  const prevSignedIn = useRef(signedIn);
  const menuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

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
        const raw = localStorage.getItem(CHAT_STORAGE_KEY);
        if (!raw) return;
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
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(sessions));
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

  // After a successful sign-in, auto-send the message that triggered the gate.
  useEffect(() => {
    if (!prevSignedIn.current && signedIn && pendingDraft.current) {
      const text = pendingDraft.current;
      pendingDraft.current = null;
      attemptSend(text);
    }
    prevSignedIn.current = signedIn;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  if (!open) return null;

  const SUGGESTIONS = [
    "Recommend something for tonight 🎬",
    "I'm in the mood for action",
    "Something emotional and deep",
    "Surprise me 🎲",
  ];

  function handleSuggestion(text: string) {
    setShowSuggestions(false);
    attemptSend(text);
  }

  function handleVoice() {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      alert("Voice input needs a secure (HTTPS) connection in this browser.");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice recognition is not supported on this device/browser.");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SpeechRecognition() as any;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    setIsListening(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript as string;
      setDraft(transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
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

  function attemptSend(text: string, imageDataUrl?: string | null) {
    const value = text.trim();
    const hasImage = Boolean(imageDataUrl);
    if (!value && !hasImage) return;
    const outboundText = value || "Analyze this image and suggest what to watch.";

    const acct = useAccountStore.getState();

    // 1. Gmail sign-in gate — anonymous user past their first message.
    if (shouldGateAuth(acct)) {
      pendingDraft.current = outboundText;
      setDraft("");
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
      content: imageDataUrl && !draft.trim() ? "Sent an image for analysis." : text,
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
      }),
    })
      .then((r) => r.json())
      .then((data: { content?: string; error?: string; recommendations?: import("@/lib/types").Movie[]; provider?: "groq" | "openai" }) => {
        const content = data.content ?? "Sorry, I hit a snag. Try asking again! 🎬";
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
              ? { ...m, content: "Network error — please try again." }
              : m,
          ),
        );
      });
  }

  const modelInfo = MODELS[usage.tier];

  return (
    <>
    <div className="fixed inset-0 z-50">
      {/* Overscroll/Keyboard background guard for iOS PWA */}
      <div className="absolute -inset-y-[100vh] inset-x-0 bg-background lg:hidden" />

      {/* Desktop scrim — clicking outside the docked panel closes it */}
      <button
        type="button"
        aria-label="Close chat"
        onClick={close}
        className="absolute inset-0 hidden bg-black/60 backdrop-blur-sm lg:block"
      />

      {/* Panel: full-screen slide-up on mobile, right-docked on desktop */}
      <div className="absolute inset-0 mx-auto flex max-w-app animate-slide-up flex-col bg-background lg:inset-y-0 lg:left-auto lg:right-0 lg:mx-0 lg:w-[440px] lg:animate-slide-in-right lg:border-l lg:border-border">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={close}
            aria-label="Back"
            className="grid h-9 w-9 place-items-center rounded-full text-text-secondary transition hover:bg-surface hover:text-white"
          >
            <ChevronLeft size={22} />
          </button>
          <CompanionAvatar companion={signedIn ? aiCompanion : null} size={34} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">{assistantName}</p>
            <p className="truncate text-xs text-text-secondary">{topic}</p>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Menu"
              onClick={() => setMenuOpen((value) => !value)}
              className="grid h-9 w-9 place-items-center rounded-full text-text-secondary transition hover:bg-surface hover:text-white"
            >
              <MoreVertical size={20} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-11 z-10 w-72 rounded-2xl border border-border bg-surface p-2 shadow-2xl">
                <button
                  type="button"
                  onClick={startNewChat}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-white transition hover:bg-surface-raised"
                >
                  <SquarePen size={16} className="text-text-secondary" />
                  New chat
                </button>
                <button
                  type="button"
                  onClick={clearCurrentChat}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-rose-300 transition hover:bg-surface-raised"
                >
                  <Trash2 size={16} className="text-rose-300" />
                  Clear current chat
                </button>

                <div className="mt-2 border-t border-border pt-2">
                  <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
                    Previous chats
                  </p>

                  {previousChats.length > 0 ? (
                    <div className="space-y-1">
                      {previousChats.map((session) => (
                        <div key={session.id} className="flex items-center gap-2 rounded-xl px-1 py-1 hover:bg-surface-raised">
                          <button
                            type="button"
                            onClick={() => openSession(session.id)}
                            className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left"
                          >
                            <p className="truncate text-sm text-white">{session.title}</p>
                            <p className="text-xs text-text-secondary">{session.timeAgo}</p>
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${session.title}`}
                            onClick={() => deleteSession(session.id)}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-secondary transition hover:bg-background hover:text-rose-300"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="px-3 py-2 text-sm text-text-secondary">No previous chats yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* History */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-4 py-5">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>

        {/* Usage / model indicator */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 pt-2.5 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-text-secondary">
            <span
              className={cn(
                "grid h-4 w-4 place-items-center rounded-full",
                usage.tier === "advanced" ? "bg-gradient-primary" : "bg-surface-raised",
              )}
            >
              {usage.tier === "advanced" ? (
                <Sparkles size={10} className="text-white" />
              ) : (
                <Zap size={10} className="text-text-secondary" />
              )}
            </span>
            {modelInfo.label}
          </span>


        </div>

        {/* Input bar */}
        <div className="relative bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {/* iOS keyboard gap fill: extends 100vh downwards to hide any movies showing underneath */}
          <div className="absolute inset-x-0 top-0 -z-10 h-[100vh] bg-background lg:hidden" />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            aria-label="Attach an image"
            className="hidden"
            onChange={onImageSelected}
          />

          {attachedImageDataUrl && (
            <div className="mb-3 relative inline-block">
              <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-primary/40 bg-surface-raised shadow-sm">
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
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-surface-raised border border-border text-text-secondary hover:text-white shadow-md transition-colors"
                aria-label="Remove image"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Quick suggestion chips */}
          {showSuggestions && (
            <div className="mb-2 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSuggestion(s)}
                  className="rounded-full border border-primary/40 bg-surface-raised px-3 py-1.5 text-xs text-primary transition hover:bg-primary/10"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="input-glow flex items-end gap-2 rounded-2xl border border-border bg-surface px-2 py-1.5 transition duration-200">
            <button
              type="button"
              aria-label="Quick suggestions"
              onClick={() => setShowSuggestions((v) => !v)}
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-full transition",
                showSuggestions ? "text-primary" : "text-text-secondary hover:text-white",
              )}
            >
              <Plus size={20} />
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              rows={1}
              onChange={(e) => {
                setDraft(e.target.value);
                // Auto-grow: reset height then set to scrollHeight, capped at ~5 lines
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  attemptSend(draft, attachedImageDataUrl);
                  // Reset height after send
                  e.currentTarget.style.height = "auto";
                }
              }}
              placeholder="Ask DXB…"
              className="min-w-0 flex-1 resize-none bg-transparent py-2 text-sm leading-snug text-white placeholder:text-text-secondary focus:outline-none"
              style={{ maxHeight: "140px", overflowY: "auto" }}
            />
            <button
              type="button"
              aria-label="Attach image"
              onClick={pickImage}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-text-secondary transition hover:text-white"
            >
              <ImagePlus size={20} />
            </button>
            {draft.trim() || attachedImageDataUrl ? (
              <button
                type="button"
                onClick={() => attemptSend(draft, attachedImageDataUrl)}
                aria-label="Send"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-primary text-white transition active:scale-95"
              >
                <ArrowUp size={18} />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Voice input"
                onClick={handleVoice}
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full transition",
                  isListening ? "animate-pulse text-primary" : "text-text-secondary hover:text-white",
                )}
              >
                <Mic size={20} />
              </button>
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
