import { Metadata } from "next";
import { Redirector } from "./redirector";

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
    
    const title = data.title || data.name || "DXBmovies";
    const description = data.overview || "Discover this on DXBmovies.";
    const imageUrl = data.poster_path 
      ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${data.poster_path}`
      : "https://dxbmovie.online/icons/icon-512.png";

    return {
      title: `${title} - DXBmovies`,
      description,
      openGraph: {
        title: `${title} - DXBmovies`,
        description,
        images: [{ url: imageUrl }],
        type: "video.movie",
      },
      twitter: {
        card: "summary_large_image",
        title: `${title} - DXBmovies`,
        description,
        images: [imageUrl],
      },
    };
  } catch (e) {
    return {
      title: "DXBmovies",
    };
  }
}

export default function MovieDeepLink({ params, searchParams }: Props) {
  // We render a client-side redirect so that crawlers parse the OpenGraph tags above
  // rather than following a 301/302 server redirect to the root page.
  return <Redirector id={params.id} type={searchParams.type} />;
}
