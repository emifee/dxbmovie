import { Metadata } from "next";
import { Redirector } from "@/app/m/[id]/redirector";

const TMDB_API_KEY = process.env.TMDB_API_KEY;

type Props = {
  params: { id: string };
  searchParams: { type?: string };
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  try {
    const type = searchParams.type === "tv" ? "tv" : "movie";
    const res = await fetch(`https://api.themoviedb.org/3/${type}/${params.id}?api_key=${TMDB_API_KEY}`);
    if (!res.ok) throw new Error("TMDB fetch failed");
    const data = await res.json();
    
    const title = data.title || data.name || "DXBmovies Reel";
    const description = `Watch the trailer for ${title} on DXBmovies.`;
    
    // For reels, a landscape backdrop is generally better if available
    const imageUrl = data.backdrop_path 
      ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}`
      : data.poster_path 
        ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${data.poster_path}`
        : "https://dxbmovie.online/icons/icon-512.png";

    return {
      title: `${title} - Trailer - DXBmovies`,
      description,
      openGraph: {
        title: `${title} - Trailer - DXBmovies`,
        description,
        images: [{ url: imageUrl }],
        type: "video.movie",
      },
      twitter: {
        card: "summary_large_image",
        title: `${title} - Trailer - DXBmovies`,
        description,
        images: [imageUrl],
      },
    };
  } catch (e) {
    return {
      title: "DXBmovies Reel",
    };
  }
}

export default function ReelDeepLink({ params, searchParams }: Props) {
  return <Redirector id={params.id} type={searchParams.type} isReel={true} />;
}
