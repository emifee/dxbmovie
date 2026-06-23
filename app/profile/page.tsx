"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { ChevronRight, Plus, X, Sparkles, LogOut, Pencil, Check, Trash2, Smartphone, User } from "lucide-react";
import { useSession, signOut as nextAuthSignOut } from "next-auth/react";
import { BottomNav } from "@/components/bottom-nav";
import { SideNav } from "@/components/side-nav";
import { MenuDrawer } from "@/components/menu-drawer";
import { ChatDrawer } from "@/components/chat/chat-drawer";
import { MovieDetailDrawer } from "@/components/movie-detail-drawer";
import { TrailerModal } from "@/components/trailer-modal";
import { Sparkle } from "@/components/ui/sparkle";
import { GoogleGate } from "@/components/auth/google-gate";
import { useUIStore } from "@/lib/store";
import { useAccountStore } from "@/lib/account-store";
import type { CompanionGender, CompanionRace, Movie, ChatSessionSummary } from "@/lib/types";
import { tmdbImage, cn } from "@/lib/utils";
import { STREAMING_SERVICES, GENRES } from "@/lib/constants";
import { COMPANION_RACE_OPTIONS } from "@/lib/ai-companion";
import { GENRE_LIST } from "@/lib/genre-list";
import { GradientOrb } from "@/components/ui/gradient-orb";
import { CompanionAvatar } from "@/components/ui/companion-avatar";
import { GoogleButton } from "@/components/login/google-button";
import Link from "next/link";

export default function ProfilePage() {
  const openDetail = useUIStore((s) => s.openDetail);
  const openChat = useUIStore((s) => s.openChat);
  const openAuthGate = useUIStore((s) => s.openAuthGate);

  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const chatOpen = useUIStore((s) => s.chatOpen);
  const signedIn = useAccountStore((s) => s.signedIn);
  const aiCompanion = useAccountStore((s) => s.aiCompanion);
  const setAICompanion = useAccountStore((s) => s.setAICompanion);
  const clearAICompanion = useAccountStore((s) => s.clearAICompanion);
  const { data: session } = useSession();

  // ── Real data state ──
  const [stats, setStats] = useState({ discussed: 0, watchlistCount: 0, chatCount: 0 });
  const [watchlist, setWatchlist] = useState<Movie[]>([]);
  const [dnaGenres, setDnaGenres] = useState<string[]>([]);
  const [conversations, setConversations] = useState<ChatSessionSummary[]>([]);
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [accuracyScore, setAccuracyScore] = useState<number | null>(null);
  const [accuracyMessage, setAccuracyMessage] = useState<string | null>(null);
  const [dnaEditing, setDnaEditing] = useState(false);
  const [dnaWorking, setDnaWorking] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [services, setServices] = useState<string[]>(["netflix", "prime"]);

  useEffect(() => {
    const savedServices = localStorage.getItem("dxb:services");
    if (savedServices) {
      try {
        setServices(JSON.parse(savedServices));
      } catch {}
    }
  }, []);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardGender, setWizardGender] = useState<CompanionGender | null>(null);
  const [wizardName, setWizardName] = useState("");
  const [wizardRace, setWizardRace] = useState<CompanionRace | null>(null);
  const [isCreatingCompanion, setIsCreatingCompanion] = useState(false);
  const [companionError, setCompanionError] = useState<string | null>(null);
  const [pwaOpen, setPwaOpen] = useState(false);

  // ── Fetch profile data on mount ──
  const loadProfileData = useCallback(async () => {
    if (!session?.user) { setLoadingProfile(false); return; }

    setLoadingProfile(true);
    try {
      const [profileRes, watchlistRes, conversationsRes] = await Promise.all([
        fetch("/api/user/profile"),
        fetch("/api/user/watchlist"),
        fetch("/api/user/conversations"),
      ]);

      if (profileRes.ok) {
        const data = await profileRes.json();
        setStats({
          discussed: data.discussed ?? 0,
          watchlistCount: data.watchlistCount ?? 0,
          chatCount: data.chatCount ?? 0,
        });
        setDnaGenres(data.genres ?? []);
        if (data.joinedAt) setJoinedAt(data.joinedAt);
        if (data.accuracyScore !== undefined) setAccuracyScore(data.accuracyScore);
        if (data.accuracyMessage) setAccuracyMessage(data.accuracyMessage);
      }

      if (watchlistRes.ok) {
        const movies = await watchlistRes.json();
        if (Array.isArray(movies)) setWatchlist(movies);
      }

      if (conversationsRes.ok) {
        const sessions = await conversationsRes.json();
        if (Array.isArray(sessions)) {
          setConversations(
            sessions.map((s: { id: string; title: string; updatedAt: number }) => ({
              id: s.id,
              title: s.title,
              timeAgo: formatTimeAgo(s.updatedAt),
            })),
          );
        }
      }
    } catch {
      // Fail silently — show zeros/empty.
    } finally {
      setLoadingProfile(false);
    }
  }, [session?.user]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  const displayName = session?.user?.name?.split(" ")[0] ?? "Guest";
  const fullName = session?.user?.name ?? "Guest";
  const avatarUrl = session?.user?.image ?? "";

  const joinedDisplay = joinedAt
    ? new Date(joinedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "Recently";

  function toggleService(slug: string) {
    setServices((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      localStorage.setItem("dxb:services", JSON.stringify(next));
      return next;
    });
  }

  // ── DNA editing ──
  function toggleDnaGenre(genre: string) {
    const genreId = GENRES.find((x) => x.label === genre)?.id;
    setDnaGenres((prev) => {
      // Remove if string exists
      if (prev.includes(genre)) return prev.filter((g) => g !== genre);
      // Remove if ID exists (number or string representation)
      if (genreId && (prev.includes(genreId as any) || prev.includes(genreId.toString()))) {
        return prev.filter((g) => g !== genreId && g !== genreId.toString());
      }
      // Add new string
      return [...prev, genre].slice(0, 10);
    });
  }

  async function saveDna() {
    setDnaWorking(true);
    try {
      const res = await fetch("/api/user/dna", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genres: dnaGenres }),
      });
      if (res.ok) {
        setDnaEditing(false);
      }
    } catch {
      // silent
    } finally {
      setDnaWorking(false);
    }
  }

  // ── Conversation remove ──
  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      await fetch(`/api/user/conversations?id=${id}`, { method: "DELETE" });
      const raw = localStorage.getItem("dxb:chat-sessions");
      if (raw) {
        const stored = JSON.parse(raw);
        localStorage.setItem(
          "dxb:chat-sessions",
          JSON.stringify(stored.filter((s: any) => s.id !== id))
        );
      }
    } catch (err) {
      console.error("Failed to delete conversation", err);
    }
  };

  // ── Watchlist remove ──
  async function removeFromWatchlist(movieId: number) {
    setWatchlist((prev) => prev.filter((m) => m.id !== movieId));
    setStats((prev) => ({ ...prev, watchlistCount: Math.max(0, prev.watchlistCount - 1) }));
    try {
      await fetch("/api/user/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId }),
      });
    } catch {
      // Optimistic — already removed from UI.
    }
  }

  // ── Companion creation ──
  async function saveCompanion() {
    if (!wizardGender || !wizardRace || !wizardName.trim()) return;
    const cleanName = wizardName.trim();

    setIsCreatingCompanion(true);
    setCompanionError(null);

    let avatarUrl: string | undefined;

    try {
      const res = await fetch("/api/companion-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          gender: wizardGender,
          race: wizardRace,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to generate companion image");
      }

      const data = (await res.json()) as { avatarUrl?: string };
      avatarUrl = data.avatarUrl;

      if (!avatarUrl) {
        throw new Error("Could not generate companion image. Please try again.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not generate companion image.";
      setCompanionError(message);
      setIsCreatingCompanion(false);
      return;
    }

    setAICompanion({
      gender: wizardGender,
      race: wizardRace,
      name: cleanName,
      avatarSeed: `${cleanName}-${wizardGender}-${wizardRace}`,
      avatarUrl,
    });

    setIsCreatingCompanion(false);
  }

  function resetCompanionWizard() {
    setWizardStep(1);
    setWizardGender(null);
    setWizardName("");
    setWizardRace(null);
    setCompanionError(null);
  }

  return (
    <div className={cn("relative min-h-dvh transition-[padding] duration-200", collapsed ? "lg:pl-20" : "lg:pl-64")}>
      <SideNav />
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/15 to-transparent", chatOpen && "invisible lg:visible")} />

      <div className={cn("relative mx-auto w-full max-w-app px-5 pb-24 pt-10 lg:max-w-3xl lg:px-10 lg:pb-12", chatOpen && "invisible lg:visible")}>
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          {signedIn ? (
            <>
              <div className="rounded-full bg-gradient-primary p-[3px] shadow-glow">
                <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-surface">
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt={fullName} width={80} height={80} className="object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-gradient">{displayName.charAt(0)}</span>
                  )}
                </div>
              </div>
              <h1 className="mt-3 text-xl font-bold text-white">{fullName}</h1>
              <p className="text-sm text-text-secondary">Joined {joinedDisplay}</p>
            </>
          ) : (
            <div className="relative mx-auto mt-4 flex w-full max-w-md flex-col items-center text-center">
              {/* Ambient background glow */}
              <div className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-primary/20 blur-[80px]" />

              {/* Top: logo + tagline */}
              <div className="z-10 mb-10 text-center">
                <h1 className="text-2xl font-bold">
                  <span className="text-gradient">DXBmovies</span>
                </h1>
                <p className="mt-1 text-sm text-text-secondary">Your ultimate movie companion</p>
              </div>

              {/* Center: orb + headline */}
              <div className="z-10 flex w-full flex-col items-center text-center">
                <GradientOrb size={160} className="mb-8 animate-orb-pulse" />
                <h2 className="mb-8 max-w-xs text-3xl font-bold leading-tight text-white">
                  Movies, Matched to Your Mood
                </h2>

                {/* CTA */}
                <div className="w-full">
                  <GoogleButton />
                  <p className="mt-4 text-center text-[11px] text-text-secondary">
                    By continuing you agree to our{" "}
                    <Link href="/terms" className="underline underline-offset-2">
                      Terms
                    </Link>
                    {" "}and{" "}
                    <Link href="/privacy" className="underline underline-offset-2">
                      Privacy Policy
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* The rest of the content should only be accessible if signed in */}
        {signedIn && (
          <>
            {/* AI companion setup */}


        {signedIn && !aiCompanion && (
          <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">Create Your AI Character</p>

            {wizardStep === 1 && (
              <div className="mt-3">
                <p className="text-sm font-semibold text-white">Choose companion type</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWizardGender("female")}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-sm transition",
                      wizardGender === "female"
                        ? "border-primary bg-primary/10 text-white"
                        : "border-border text-text-secondary hover:text-white",
                    )}
                  >
                    Female
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardGender("male")}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-sm transition",
                      wizardGender === "male"
                        ? "border-primary bg-primary/10 text-white"
                        : "border-border text-text-secondary hover:text-white",
                    )}
                  >
                    Male
                  </button>
                </div>
                <button
                  type="button"
                  disabled={!wizardGender}
                  onClick={() => setWizardStep(2)}
                  className="mt-4 w-full rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Continue
                </button>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="mt-3">
                <p className="text-sm font-semibold text-white">Name your companion</p>
                <input
                  value={wizardName}
                  onChange={(e) => setWizardName(e.target.value)}
                  placeholder={wizardGender === "female" ? "e.g. Sonia" : "e.g. Adam"}
                  className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-white placeholder:text-text-secondary focus:border-primary/60 focus:outline-none"
                />
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!wizardName.trim()}
                    onClick={() => setWizardStep(3)}
                    className="rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="mt-3">
                <p className="text-sm font-semibold text-white">Choose race</p>
                <div className="mt-3 space-y-2">
                  {COMPANION_RACE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setWizardRace(option.value)}
                      className={cn(
                        "w-full rounded-xl border px-3 py-2.5 text-left text-sm transition",
                        wizardRace === option.value
                          ? "border-primary bg-primary/10 text-white"
                          : "border-border text-text-secondary hover:text-white",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!wizardRace || isCreatingCompanion}
                    onClick={saveCompanion}
                    className="rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {isCreatingCompanion ? "Creating..." : "Create Companion"}
                  </button>
                </div>

                {companionError && (
                  <p className="mt-3 text-xs text-rose-300">{companionError}</p>
                )}
              </div>
            )}
          </section>
        )}

        {signedIn && aiCompanion && (
          <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">Your AI Companion</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CompanionAvatar companion={aiCompanion} size={52} />
                <div>
                  <p className="text-sm font-semibold text-white">{aiCompanion.name}</p>
                  <p className="text-xs capitalize text-text-secondary">
                    {aiCompanion.gender} companion
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  clearAICompanion();
                  resetCompanionWizard();
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition hover:text-white"
              >
                Recreate
              </button>
            </div>
          </section>
        )}

        {/* Stats — real data */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <StatCard value={loadingProfile ? "–" : stats.discussed} label="Discussed" />
          <StatCard value={loadingProfile ? "–" : stats.watchlistCount} label="Watchlist" />
          <StatCard value={loadingProfile ? "–" : stats.chatCount} label="AI Chats" />
        </div>

        {/* Movie DNA — editable */}
        <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Your Movie DNA</h2>
            {session?.user && (
              <button
                onClick={dnaEditing ? saveDna : () => setDnaEditing(true)}
                disabled={dnaWorking}
                className="flex items-center gap-1 text-sm font-medium text-primary hover:text-white disabled:opacity-50"
              >
                {dnaEditing ? (
                  <>
                    {dnaWorking ? (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    ) : (
                      <Check size={12} />
                    )}
                    {dnaWorking ? "Saving…" : "Save"}
                  </>
                ) : (
                  <>
                    <Pencil size={12} />
                    Edit
                  </>
                )}
              </button>
            )}
          </div>
          
          {/* Decaying Accuracy UI */}
          {accuracyScore !== null && accuracyMessage && (
            <div className="mt-4 rounded-2xl bg-surface-raised p-4 border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white flex items-center gap-1.5">
                  <Sparkles size={14} className={accuracyScore < 70 ? "text-orange-400" : "text-primary"} />
                  Sonia's Accuracy
                </span>
                <span className={cn(
                  "text-sm font-bold",
                  accuracyScore < 70 ? "text-orange-400" : "text-primary"
                )}>
                  {accuracyScore}%
                </span>
              </div>
              
              {/* Progress bar */}
              <div className="h-1.5 w-full bg-surface rounded-full overflow-hidden mb-2">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-1000",
                    accuracyScore < 70 ? "bg-orange-400" : "bg-gradient-primary"
                  )}
                  style={{ width: `${accuracyScore}%` }}
                />
              </div>
              
              <p className="text-xs text-text-secondary leading-relaxed">
                {accuracyMessage}
              </p>
            </div>
          )}

          {dnaEditing ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {GENRE_LIST.map((g) => {
                const genreId = GENRES.find(x => x.label === g)?.id;
                const active = dnaGenres.includes(g) || (genreId && (dnaGenres.includes(genreId as any) || dnaGenres.includes(genreId.toString())));
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleDnaGenre(g)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition",
                      active
                        ? "bg-gradient-primary text-white shadow-glow"
                        : "border border-border bg-surface-raised text-text-secondary hover:text-white",
                    )}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          ) : dnaGenres.length > 0 ? (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {dnaGenres.map((g) => {
                  const label = GENRES.find(x => x.id === g || x.id.toString() === g.toString())?.label || g;
                  return (
                    <span
                      key={g}
                      className="rounded-full bg-gradient-primary p-[1.5px]"
                    >
                      <span className="block rounded-full bg-surface px-3 py-1 text-xs font-medium text-white">
                        {label}
                      </span>
                    </span>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-text-secondary">
                Your favorite genres · tap Edit to change
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-text-secondary">
              {session?.user
                ? "Tap Edit to set your favorite genres"
                : "Sign in to build your movie DNA"}
            </p>
          )}
        </section>

        {/* Watchlist — real data */}
        <section className="mt-6">
          <h2 className="mb-3 text-base font-bold text-white">Watchlist</h2>
          {watchlist.length > 0 ? (
            <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
              {watchlist.map((m) => {
                const poster = tmdbImage(m.posterPath);
                return (
                  <div key={m.id} className="relative w-28 shrink-0">
                    <button
                      onClick={() => openDetail(m)}
                      className="relative block aspect-[2/3] w-full overflow-hidden rounded-2xl border border-border"
                    >
                      {poster && (
                        <Image src={poster} alt={m.title || "Movie"} fill sizes="112px" className="object-cover" />
                      )}
                    </button>
                    <button
                      onClick={() => removeFromWatchlist(m.id)}
                      aria-label={`Remove ${m.title}`}
                      className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/80 text-white transition hover:bg-black"
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
              {/* Add more card */}
              <a
                href="/"
                className="grid aspect-[2/3] w-28 shrink-0 place-items-center rounded-2xl border border-dashed border-border bg-surface text-text-secondary transition hover:border-primary/60 hover:text-white"
              >
                <span className="flex flex-col items-center gap-1 text-xs">
                  <Plus size={20} />
                  Add more
                </span>
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-2xl border border-border bg-surface px-6 py-10 text-center">
              <Sparkle size={44} />
              <p className="mt-3 text-sm text-text-secondary">
                Your watchlist is empty. Browse movies and tap Watchlist to add.
              </p>
            </div>
          )}
        </section>

        {/* Recent conversations — real data */}
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Recent AI Conversations</h2>
            {conversations.length > 0 && (
              <button className="text-xs font-medium text-gradient">See all</button>
            )}
          </div>
          {conversations.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              {conversations.map((s, i) => (
                <div
                  key={s.id}
                  className={`flex w-full items-center px-4 py-3.5 transition hover:bg-surface-raised group ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <button
                    onClick={() => openChat()}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <Sparkle size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{s.title}</p>
                      <p className="text-xs text-text-secondary">{s.timeAgo}</p>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={(e) => deleteConversation(s.id, e)}
                      className="grid h-8 w-8 place-items-center rounded-full text-text-secondary opacity-0 transition hover:bg-surface hover:text-red-400 group-hover:opacity-100 lg:opacity-100"
                      aria-label="Delete conversation"
                    >
                      <Trash2 size={16} />
                    </button>
                    <ChevronRight size={18} className="text-text-secondary pointer-events-none" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface px-6 py-8 text-center">
              <p className="text-sm text-text-secondary">
                {session?.user ? "No conversations yet. Start chatting!" : "Sign in to see your chat history"}
              </p>
            </div>
          )}
        </section>

        {/* Settings */}
        <section className="mt-6">
          <h2 className="mb-3 text-base font-bold text-white">Settings</h2>
          <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
            {/* Notifications */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-white">Notifications</span>
              <NotificationToggle />
            </div>

            {/* Streaming services */}
            <div>
              <p className="text-sm text-white">Preferred streaming services</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {STREAMING_SERVICES.map((svc) => {
                  const active = services.includes(svc.slug);
                  return (
                    <button
                      key={svc.slug}
                      onClick={() => toggleService(svc.slug)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                        active
                          ? "border-primary/60 bg-surface-raised text-white shadow-glow"
                          : "border-border bg-surface text-text-secondary hover:text-white"
                      }`}
                    >
                      <span
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                          active ? "border-primary bg-gradient-primary" : "border-border"
                        }`}
                      >
                        {active && <CheckMark />}
                      </span>
                      {svc.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Download App */}
          <button
            type="button"
            onClick={() => setPwaOpen(true)}
            className="mt-3 flex w-full items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition hover:bg-surface-raised"
          >
            <div className="flex items-center gap-3">
              <Smartphone size={18} className="text-primary" />
              <span className="text-sm font-medium text-white">Download App</span>
            </div>
            <ChevronRight size={16} className="text-text-secondary" />
          </button>

          {/* Sign out */}
          <button
            type="button"
            onClick={() => nextAuthSignOut({ callbackUrl: "/login" })}
            className="mt-4 flex w-full items-center justify-center gap-2 py-3 text-sm font-medium text-red-500 transition hover:text-red-400"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </section>
          </>
        )}
      </div>

      <BottomNav />
      <MenuDrawer />
      <ChatDrawer />
      <MovieDetailDrawer />
      <TrailerModal />
      <GoogleGate />
      {pwaOpen && <PWAModal onClose={() => setPwaOpen(false)} />}

    </div>
  );
}

// ── PWA Install Modal ─────────────────────────────────────────────────────────
function PWAModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"ios" | "android">("ios");

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md animate-slide-up rounded-t-3xl bg-surface p-6 sm:rounded-3xl sm:shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-text-secondary hover:bg-surface-raised hover:text-white transition"
        >
          <X size={18} />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <Smartphone size={22} className="text-primary" />
          <h2 className="text-lg font-bold text-white">Download DXBmovies</h2>
        </div>
        <p className="mb-5 text-sm text-text-secondary">
          Install the app on your phone. No App Store needed. Works just like a native app.
        </p>

        {/* Tab switcher */}
        <div className="mb-5 flex gap-2 rounded-xl bg-surface-raised p-1">
          {(["ios", "android"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                tab === t ? "bg-gradient-primary text-white" : "text-text-secondary hover:text-white"
              }`}
            >
              {t === "ios" ? "iPhone / iPad" : "Android"}
            </button>
          ))}
        </div>

        {tab === "ios" && (
          <ol className="space-y-4">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">1</span>
              <p className="text-sm text-white">
                Open <span className="font-semibold">DXBmovies</span> in <span className="font-semibold">Safari</span> on your iPhone or iPad.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">2</span>
              <p className="text-sm text-white">
                Tap the <span className="font-semibold">Share</span> button{" "}
                <span className="inline-block rounded bg-surface-raised px-1.5 py-0.5 text-xs">⬆</span>{" "}
                at the bottom of the screen.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">3</span>
              <p className="text-sm text-white">
                Scroll down and tap{" "}
                <span className="font-semibold">&ldquo;Add to Home Screen&rdquo;</span>.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">4</span>
              <p className="text-sm text-white">
                Tap <span className="font-semibold">Add</span> in the top-right corner.
              </p>
            </li>
          </ol>
        )}

        {tab === "android" && (
          <ol className="space-y-4">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">1</span>
              <p className="text-sm text-white">
                Open <span className="font-semibold">DXBmovies</span> in <span className="font-semibold">Chrome</span>.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">2</span>
              <p className="text-sm text-white">
                Tap the <span className="font-semibold">three-dot menu</span>{" "}
                <span className="inline-block rounded bg-surface-raised px-1.5 py-0.5 text-xs">⋮</span>{" "}
                in the top-right corner.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">3</span>
              <p className="text-sm text-white">
                Tap <span className="font-semibold">&ldquo;Add to Home screen&rdquo;</span> or{" "}
                <span className="font-semibold">&ldquo;Install app&rdquo;</span>.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white">4</span>
              <p className="text-sm text-white">
                Tap <span className="font-semibold">Install</span> to confirm.
              </p>
            </li>
          </ol>
        )}

        <p className="mt-5 text-center text-xs text-text-secondary">
          The app icon will appear on your home screen just like any other app.
        </p>
      </div>
    </div>
  );
}

function StatCard({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-2 py-4 text-center">
      <p className="text-2xl font-bold text-gradient">{value}</p>
      <p className="mt-0.5 text-[11px] text-text-secondary">{label}</p>
    </div>
  );
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

function NotificationToggle() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("dxb:notifications");
    if (saved !== null) {
      setOn(saved === "true");
    }
  }, []);

  const toggle = () => {
    setOn((v) => {
      const next = !v;
      localStorage.setItem("dxb:notifications", String(next));
      return next;
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle notifications"
      className={`relative h-6 w-11 rounded-full transition ${
        on ? "bg-gradient-primary" : "bg-surface-raised border border-border"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function CheckMark() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 6.5L5 9L9.5 3.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
