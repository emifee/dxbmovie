"use client";

import { useState, useEffect } from "react";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Share2, CheckCircle2, ArrowLeft, ListVideo, User, ThumbsUp, ThumbsDown } from "lucide-react";
import { MoviePosterCard } from "@/components/movie-poster-card";
import { MovieDetailDrawer } from "@/components/movie-detail-drawer";
import { TrailerModal } from "@/components/trailer-modal";
import { ChatDrawer } from "@/components/chat/chat-drawer";
import { BottomNav } from "@/components/bottom-nav";
import { tmdbImage, cn } from "@/lib/utils";
import type { UserList } from "@/lib/types";
import { CreateListNudge } from "@/components/create-list-nudge";

export default function PublicListPage({ params }: { params: { slug: string } }) {
  const [list, setList] = useState<UserList & { creatorOnline: boolean; creatorAvatar?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [notFoundError, setNotFoundError] = useState(false);
  const [userVote, setUserVote] = useState<"upvote" | "downvote" | null>(null);

  useEffect(() => {
    const v = localStorage.getItem(`dxb_vote_${params.slug}`);
    if (v === "upvote" || v === "downvote") setUserVote(v);
  }, [params.slug]);

  async function handleVote(action: "upvote" | "downvote") {
    if (userVote === action) return; // Prevent spam clicking the same vote
    
    const prevVote = userVote;
    setUserVote(action);
    localStorage.setItem(`dxb_vote_${params.slug}`, action);
    
    setList(prev => {
      if (!prev) return prev;
      let newUp = prev.upvotes || 0;
      let newDown = prev.downvotes || 0;
      
      if (action === "upvote") {
        newUp++;
        if (prevVote === "downvote") newDown = Math.max(0, newDown - 1);
      } else {
        newDown++;
        if (prevVote === "upvote") newUp = Math.max(0, newUp - 1);
      }
      return { ...prev, upvotes: newUp, downvotes: newDown };
    });

    try {
      await fetch(`/api/lists/${params.slug}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, prevVote }),
      });
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    fetch(`/api/lists/${params.slug}`)
      .then(async (res) => {
        if (!res.ok) { setNotFoundError(true); return; }
        const data = await res.json();
        setList(data);
      })
      .catch(() => setNotFoundError(true))
      .finally(() => setLoading(false));
  }, [params.slug]);

  async function handleShare() {
    const url = `https://dxbmovie.online/list/${params.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(list?.name || "Check out my movie list on DXBmovies!")}`, "_blank");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
      </div>
    );
  }

  if (notFoundError || !list) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-6 text-center">
        <ListVideo size={48} className="text-white/20 mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">List Not Found</h1>
        <p className="text-sm text-white/40 mb-6">This list may have been deleted or made private.</p>
        <Link href="/" className="rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white hover:opacity-90 transition">
          Go Home
        </Link>
      </div>
    );
  }

  // Map list items to Movie objects for MoviePosterCard
  const movies = list.items.map((item) => ({
    id: item.id,
    title: item.title,
    year: item.year,
    rating: item.rating || 0,
    posterPath: item.posterPath,
    backdropPath: null,
    overview: "",
    genres: [],
    cast: [],
    mediaType: item.mediaType,
  }));

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pb-24">
      {/* Hero backdrop - use first item poster as blurred bg */}
      <div className="relative overflow-hidden">
        {list.items[0]?.posterPath && (
          <div className="absolute inset-0">
            <Image
              src={tmdbImage(list.items[0].posterPath, "w500") as string}
              alt=""
              fill
              className="object-cover opacity-10 blur-2xl scale-110"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-[#0A0A0A]/80 to-[#0A0A0A]" />
          </div>
        )}

        <div className="relative z-10 mx-auto max-w-2xl px-5 pt-safe-top">
          {/* Back link */}
          <div className="flex items-center gap-3 py-5">
            <Link
              href="/"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <ArrowLeft size={20} />
            </Link>
            <span className="text-sm font-medium text-white/40">DXBmovies</span>
          </div>

          {/* List header */}
          <div className="pb-8 pt-2">
            <h1 className="text-2xl font-bold leading-snug text-white mb-4">{list.name}</h1>

            {/* Creator info */}
            <div className="flex items-center gap-3 mb-5">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/10 shrink-0 overflow-hidden">
                {list.creatorAvatar ? (
                  <Image src={list.creatorAvatar} alt={list.userName || "Creator"} fill className="object-cover" unoptimized />
                ) : (
                  <User size={16} className="text-white/40" />
                )}
                {/* Online dot */}
                {list.creatorOnline && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-[#0A0A0A] shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{list.userName || "DXBmovies User"}</p>
                <p className="text-xs text-white/40">
                  {list.items.length} title{list.items.length !== 1 ? "s" : ""}
                  {list.creatorOnline && (
                    <span className="ml-2 text-emerald-400 font-medium">· 🟢 Online now</span>
                  )}
                </p>
              </div>
            </div>

            {/* Actions: Share & Vote */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleShare}
                className={cn(
                  "flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition flex-1 sm:flex-none justify-center",
                  copied
                    ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                    : "bg-white/10 border border-white/15 text-white hover:bg-white/15"
                )}
              >
                {copied ? <CheckCircle2 size={15} /> : <Share2 size={15} />}
                {copied ? "Link Copied!" : "Share this List"}
              </button>

              <div className="flex items-center gap-1 rounded-2xl bg-white/5 border border-white/10 p-1">
                <button
                  onClick={() => handleVote("upvote")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                    userVote === "upvote" ? "bg-emerald-500/20 text-emerald-400" : "text-white/60 hover:text-white hover:bg-white/10"
                  )}
                >
                  <ThumbsUp size={16} className={userVote === "upvote" ? "fill-emerald-400" : ""} />
                  <span>{list.upvotes || 0}</span>
                </button>
                <div className="w-px h-4 bg-white/10" />
                <button
                  onClick={() => handleVote("downvote")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                    userVote === "downvote" ? "bg-red-500/20 text-red-400" : "text-white/60 hover:text-white hover:bg-white/10"
                  )}
                >
                  <ThumbsDown size={16} className={userVote === "downvote" ? "fill-red-400" : ""} />
                  <span>{list.downvotes || 0}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Movie grid */}
      <div className="mx-auto max-w-2xl px-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          {movies.map((m) => (
            <MoviePosterCard key={m.id} movie={m} />
          ))}
        </div>

        {/* Footer CTA */}
        <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center">
          <p className="text-sm font-semibold text-white mb-1">Discover more on DXBmovies</p>
          <p className="text-xs text-white/40 mb-4">AI-powered movie discovery tailored to your taste</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white hover:opacity-90 transition"
          >
            Open App
          </Link>
        </div>
      </div>

      <BottomNav />
      <MovieDetailDrawer />
      <ChatDrawer />
      <TrailerModal />
      <CreateListNudge listOwnerEmail={list.userId} />
    </div>
  );
}
