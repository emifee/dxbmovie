"use client";

import { useState } from "react";
import Image from "next/image";
import { Plus, Pencil, Trash2, Globe, Lock, Share2, CheckCircle2, ListVideo } from "lucide-react";
import { tmdbImage, cn } from "@/lib/utils";
import type { UserList } from "@/lib/types";
import { ListEditorDrawer } from "./list-editor-drawer";

interface Props {
  lists: UserList[];
  onChange: (lists: UserList[]) => void;
}

export function ListManager({ lists, onChange }: Props) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingList, setEditingList] = useState<UserList | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  function openCreate() {
    setEditingList(null);
    setEditorOpen(true);
  }

  function openEdit(list: UserList) {
    setEditingList(list);
    setEditorOpen(true);
  }

  function handleSaved(saved: UserList) {
    setEditorOpen(false);
    if (editingList) {
      // Update existing
      onChange(lists.map((l) => (l._id === saved._id ? saved : l)));
    } else {
      // Prepend new
      onChange([saved, ...lists]);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this list? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/user/lists/${id}`, { method: "DELETE" });
      onChange(lists.filter((l) => l._id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleShare(list: UserList) {
    const url = `https://dxbmovie.online/list/${list.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(list.slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      // fallback
      window.open(url, "_blank");
    }
  }

  return (
    <section className="mt-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ListVideo size={18} className="text-primary" />
          <h2 className="text-base font-bold text-white">My Lists</h2>
          {lists.length > 0 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/60">
              {lists.length}
            </span>
          )}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-2xl bg-primary/20 border border-primary/30 px-3.5 py-2 text-xs font-bold text-primary transition hover:bg-primary/30"
        >
          <Plus size={14} />
          Create List
        </button>
      </div>

      {/* Empty state */}
      {lists.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03] py-12 px-6 text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-white/5 border border-white/10">
            <ListVideo size={22} className="text-white/30" />
          </div>
          <p className="text-sm font-semibold text-white/60">No lists yet</p>
          <p className="mt-1 text-xs text-white/30">Create your first movie list and share it with the world!</p>
          <button
            onClick={openCreate}
            className="mt-5 flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            <Plus size={15} />
            Create Your First List
          </button>
        </div>
      )}

      {/* Lists grid */}
      {lists.length > 0 && (
        <div className="space-y-3">
          {lists.map((list) => (
            <div
              key={list._id}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 group"
            >
              {/* Cover: first 4 posters as mini collage */}
              <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-xl bg-white/5">
                {list.items[0]?.posterPath ? (
                  <Image
                    src={tmdbImage(list.items[0].posterPath, "w92") as string}
                    alt={list.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <ListVideo size={16} className="text-white/20" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{list.name}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={cn(
                    "flex items-center gap-1 text-xs font-medium",
                    list.published ? "text-emerald-400" : "text-white/40"
                  )}>
                    {list.published
                      ? <><Globe size={11} /> Published</>
                      : <><Lock size={11} /> Draft</>
                    }
                  </span>
                  <span className="text-white/20">·</span>
                  <span className="text-xs text-white/40">{list.items.length} title{list.items.length !== 1 ? "s" : ""}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {list.published && (
                  <button
                    onClick={() => handleShare(list)}
                    className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/50 transition hover:bg-white/15 hover:text-white"
                    title="Copy share link"
                  >
                    {copiedSlug === list.slug ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Share2 size={14} />}
                  </button>
                )}
                <button
                  onClick={() => openEdit(list)}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/50 transition hover:bg-white/15 hover:text-white"
                  title="Edit list"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(list._id)}
                  disabled={deletingId === list._id}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/50 transition hover:bg-rose-500/20 hover:text-rose-400 disabled:opacity-40"
                  title="Delete list"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor drawer */}
      {editorOpen && (
        <ListEditorDrawer
          list={editingList}
          onClose={() => setEditorOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </section>
  );
}
