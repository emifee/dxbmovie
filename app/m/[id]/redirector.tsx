"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function Redirector({ id, type, isReel = false }: { id: string; type?: string; isReel?: boolean }) {
  const router = useRouter();

  useEffect(() => {
    const typeQuery = type ? `&type=${type}` : "";
    if (isReel) {
      router.replace(`/reels?id=${id}${typeQuery}`);
    } else {
      router.replace(`/?m=${id}${typeQuery}`);
    }
  }, [id, type, isReel, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    </div>
  );
}
