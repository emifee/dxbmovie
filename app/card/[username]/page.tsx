import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { tmdbImage } from "@/lib/utils";
import { CardCTAButton } from "@/components/card-cta-button";

export const revalidate = 60; // Revalidate every 60s for performance

async function getPublicProfile(username: string) {
  // Using an internal fetch here, but normally would extract DB logic.
  // We'll fetch from our own API route for simplicity of this implementation.
  // Note: Absolute URL is needed for server-side fetch.
  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const res = await fetch(`${baseUrl}/api/user/public/${username}`, { next: { revalidate: 60 } });
  
  if (!res.ok) return null;
  return res.json();
}

export default async function PublicCardPage({ params }: { params: { username: string } }) {
  const profile = await getPublicProfile(params.username);

  if (!profile) {
    notFound();
  }

  const { name, image, username, tasteTitle, topGenre, stats, topMovies } = profile;

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center pb-24 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-accent/20 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Card */}
      <div className="relative mt-12 w-full max-w-[400px] px-6">
        <div 
          className="w-full rounded-[32px] bg-background text-white p-8 relative overflow-hidden flex flex-col items-center justify-center text-center shadow-2xl border border-white/10"
          style={{ background: "linear-gradient(to bottom, #121212, #000000)" }}
        >
          {/* Inner Orbs */}
          <div className="absolute top-[-50px] left-[-50px] w-[200px] h-[200px] bg-primary/30 rounded-full blur-[60px]" />
          <div className="absolute bottom-[-50px] right-[-50px] w-[200px] h-[200px] bg-accent/30 rounded-full blur-[60px]" />
          
          <div className="relative z-10 flex flex-col items-center w-full pt-4">
            <div className="rounded-full bg-gradient-primary p-1 mb-4 shadow-glow">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-surface">
                {image ? (
                  <Image src={image} alt={name} width={96} height={96} className="object-cover w-full h-full" />
                ) : (
                  <span className="text-3xl font-bold text-gradient">{name.charAt(0)}</span>
                )}
              </div>
            </div>
            
            <h2 className="text-3xl font-bold text-white mb-1">{name}</h2>
            <p className="text-lg text-primary font-medium mb-8 tracking-wide">
              {tasteTitle}
            </p>

            {topMovies && topMovies.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 w-full mb-8">
                {topMovies.map((m: any, i: number) => (
                  <div key={i} className="aspect-[2/3] w-full rounded-xl overflow-hidden border border-white/10 shadow-lg relative">
                    {m.posterPath ? (
                      <Image src={tmdbImage(m.posterPath) || ""} alt={m.title} fill className="object-cover w-full h-full" />
                    ) : (
                      <div className="w-full h-full bg-surface-raised flex items-center justify-center text-white/50 text-xs text-center p-2">
                        {m.title}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full py-12 border border-white/10 rounded-2xl mb-8 bg-white/5 flex items-center justify-center">
                <p className="text-white/50 text-sm">No movies tracked yet.</p>
              </div>
            )}

            <div className="mt-auto w-full flex justify-between items-center py-4 border-t border-white/10">
              <div className="text-left">
                <p className="text-2xl font-bold text-white">{stats.interactionCount}</p>
                <p className="text-xs text-white/60 uppercase tracking-widest">Movies Tracked</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gradient">Top 5%</p>
                <p className="text-xs text-white/60 uppercase tracking-widest">For {topGenre || "Movies"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Acquisition CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background/90 to-transparent z-50 flex flex-col items-center pointer-events-none">
        <CardCTAButton />
      </div>
    </div>
  );
}
