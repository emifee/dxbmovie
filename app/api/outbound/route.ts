import { NextResponse } from "next/server";

/**
 * GET /api/outbound
 * Handles "Where to watch" outbound links.
 * 
 * Future monetization:
 * - Map providers to specific affiliate URLs (e.g. Amazon Prime -> Amazon affiliate URL with tag)
 * - Track clicks in the database for analytics
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");
  const title = searchParams.get("title");
  
  if (!provider || !title) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // TODO: Map specific providers to affiliate links. 
  // Example: 
  // if (provider.includes("Amazon")) {
  //   return NextResponse.redirect(`https://www.amazon.com/s?k=${encodeURIComponent(title)}&tag=YOUR_AFFILIATE_TAG`);
  // }

  // Fallback: Google search to close the user loop
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`watch ${title} on ${provider}`)}`;
  
  return NextResponse.redirect(searchUrl);
}
