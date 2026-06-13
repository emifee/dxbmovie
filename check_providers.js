const TMDB_BASE = "https://api.themoviedb.org/3";
const apiKey = process.env.TMDB_API_KEY;
const watchRegion = process.env.TMDB_WATCH_REGION ?? "US";

const providers = [
  { slug: "netflix", tmdbProviderId: 8 },
  { slug: "prime", tmdbProviderId: 9 },
  { slug: "max", tmdbProviderId: 1899 },
  { slug: "apple", tmdbProviderId: 350 },
  { slug: "hulu", tmdbProviderId: 15 },
  { slug: "paramount", tmdbProviderId: 531 },
  { slug: "crunchyroll", tmdbProviderId: 283 },
  { slug: "mubi", tmdbProviderId: 11 },
  { slug: "peacock", tmdbProviderId: 386 },
  { slug: "curiosity", tmdbProviderId: 190 },
  { slug: "mgmplus", tmdbProviderId: 584 },
  { slug: "rakuten", tmdbProviderId: 35 },
  { slug: "shudder", tmdbProviderId: 99 },
  { slug: "youtubetv", tmdbProviderId: 188 },
  { slug: "britbox", tmdbProviderId: 380 },
  { slug: "plutotv", tmdbProviderId: 300 },
  { slug: "tubi", tmdbProviderId: 73 },
  { slug: "amcplus", tmdbProviderId: 528 },
];

async function check() {
  for (const p of providers) {
    const movieUrl = `${TMDB_BASE}/discover/movie?api_key=${apiKey}&watch_region=${watchRegion}&with_watch_providers=${p.tmdbProviderId}`;
    const tvUrl = `${TMDB_BASE}/discover/tv?api_key=${apiKey}&watch_region=${watchRegion}&with_watch_providers=${p.tmdbProviderId}`;
    
    const mRes = await fetch(movieUrl).then(r => r.json());
    const tRes = await fetch(tvUrl).then(r => r.json());
    
    console.log(`${p.slug.padEnd(15)} | Movies: ${mRes.total_results || 0} | TV: ${tRes.total_results || 0}`);
  }
}
check();
