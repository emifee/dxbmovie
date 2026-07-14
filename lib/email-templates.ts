import { tmdbImage } from "./utils";
import type { Movie } from "./types";

/**
 * Builds the poster HTML block for a single movie.
 * Clicking the poster or title opens the movie/TV detail page.
 */
function buildMovieCard(m: Movie, width: number): string {
  const poster = tmdbImage(m.posterPath, "w500") || "";
  const detailLink = `https://dxbmovie.online/${m.mediaType === "tv" ? "r" : "m"}/${m.id}`;
  const typeLabel = m.mediaType === "tv" ? "TV SHOW" : "MOVIE";
  const rating = (m.rating ?? 0).toFixed(1);

  return `
    <a href="${detailLink}" style="display: block; text-decoration: none; color: inherit;" target="_blank">
      <div style="position: relative; border-radius: 14px; overflow: hidden; background: #1a1a2e; box-shadow: 0 8px 32px rgba(0,0,0,0.6);">
        ${poster ? `<img src="${poster}" alt="${m.title}" width="${width}" style="display: block; width: 100%; height: auto; border-radius: 14px 14px 0 0; margin: 0; padding: 0; border: none;" />` : `<div style="height: 240px; background: linear-gradient(135deg, #2d1f4e, #1a0a2e);"></div>`}
        <!-- Badge overlay -->
        <div style="padding: 14px 14px 16px 14px; background: linear-gradient(180deg, #0f0f23 0%, #1a1a2e 100%);">
          <div style="display: inline-block; background: linear-gradient(90deg, #9333ea, #ec4899); color: #fff; font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; padding: 3px 8px; border-radius: 20px; margin-bottom: 8px;">${typeLabel} &nbsp;★ ${rating}</div>
          <p style="margin: 0; color: #ffffff; font-size: 14px; font-weight: 700; line-height: 1.3; letter-spacing: 0.2px;">${m.title}</p>
          ${m.year ? `<p style="margin: 5px 0 0 0; color: #9ca3af; font-size: 11px;">${m.year}</p>` : ""}
        </div>
      </div>
    </a>
  `;
}

/**
 * Generates the full HTML email for the welcome / trending newsletter.
 * - 4–6 movies in a 2-column poster grid (big posters, entertainment-first look)
 * - Poster click → movie/TV detail page
 * - "Discover More" button → main page
 */
export function getWelcomeEmailHtml(userName: string, selectedMovies: Movie[]): string {
  // Keep 4-6 movies
  const movies = selectedMovies.slice(0, 6);

  // Build 2-column rows
  let rowsHtml = "";
  for (let i = 0; i < movies.length; i += 2) {
    const m1 = movies[i];
    const m2 = movies[i + 1];
    rowsHtml += `
      <tr>
        <td style="padding: 0 8px 20px 0; width: 50%; vertical-align: top;">
          ${m1 ? buildMovieCard(m1, 250) : ""}
        </td>
        <td style="padding: 0 0 20px 8px; width: 50%; vertical-align: top;">
          ${m2 ? buildMovieCard(m2, 250) : ""}
        </td>
      </tr>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>What's Trending on DXB Movies | Tv Shows</title>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #08080f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color: #08080f; padding: 32px 16px;">
    <tr>
      <td align="center">

        <!-- Main card (max 600px) -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation"
          style="max-width: 600px; width: 100%; background-color: #0f0f1a; border-radius: 20px; overflow: hidden; border: 1px solid #1e1e3a;">

          <!-- ══════ HEADER GRADIENT BAR ══════ -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f0d9a 0%, #9333ea 50%, #ec4899 100%); padding: 2px 0; border-radius: 20px 20px 0 0;"></td>
          </tr>

          <!-- ══════ LOGO + BRAND ROW ══════ -->
          <tr>
            <td style="padding: 32px 40px 0 40px; text-align: center;">
              <a href="https://dxbmovie.online" style="text-decoration: none;" target="_blank">
                <img src="https://dxbmovie.online/apple-touch-icon.png" width="72" height="72" alt="DXB Movies" style="display: inline-block; border-radius: 18px; border: 2px solid rgba(147,51,234,0.4); box-shadow: 0 0 24px rgba(147,51,234,0.3);" />
              </a>
              <p style="margin: 12px 0 0 0; font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #9333ea;">DXB MOVIES | TV SHOWS</p>
            </td>
          </tr>

          <!-- ══════ HERO HEADLINE ══════ -->
          <tr>
            <td style="padding: 24px 40px 8px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 30px; font-weight: 900; line-height: 1.2; color: #ffffff; letter-spacing: -0.5px;">
                Hey ${userName || "Movie Lover"} 👋<br>
                <span style="background: linear-gradient(90deg, #a855f7, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">What's Hot Right Now</span>
              </h1>
              <p style="margin: 16px 0 0 0; font-size: 15px; line-height: 1.7; color: #9ca3af;">
                We picked ${movies.length} titles trending this week — tap any poster to dive in instantly.
              </p>
            </td>
          </tr>

          <!-- ══════ DIVIDER ══════ -->
          <tr>
            <td style="padding: 24px 40px 0 40px;">
              <div style="height: 1px; background: linear-gradient(90deg, transparent, #2d1f4e 30%, #4f0d9a 50%, #2d1f4e 70%, transparent);"></div>
            </td>
          </tr>

          <!-- ══════ SECTION LABEL ══════ -->
          <tr>
            <td style="padding: 20px 40px 16px 40px; text-align: center;">
              <span style="display: inline-block; color: #a855f7; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">🎬 &nbsp;Trending This Week</span>
            </td>
          </tr>

          <!-- ══════ MOVIE GRID ══════ -->
          <tr>
            <td style="padding: 0 24px 8px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                ${rowsHtml}
              </table>
            </td>
          </tr>

          <!-- ══════ CTA BUTTON ══════ -->
          <tr>
            <td style="padding: 8px 40px 40px 40px; text-align: center;">
              <a href="https://dxbmovie.online" target="_blank"
                style="display: inline-block; background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: #ffffff; text-decoration: none; padding: 16px 52px; border-radius: 50px; font-size: 14px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; box-shadow: 0 8px 24px rgba(147,51,234,0.4);">
                🍿 &nbsp;DISCOVER MORE
              </a>
              <p style="margin: 16px 0 0 0; font-size: 12px; color: #6b7280;">
                Find something perfect for every mood — free, forever.
              </p>
            </td>
          </tr>

          <!-- ══════ FEATURE PILLS ══════ -->
          <tr>
            <td style="padding: 0 40px 32px 40px;">
              <div style="background: linear-gradient(135deg, rgba(147,51,234,0.08), rgba(236,72,153,0.08)); border: 1px solid rgba(147,51,234,0.2); border-radius: 14px; padding: 20px; text-align: center;">
                <p style="margin: 0 0 12px 0; font-size: 12px; font-weight: 700; color: #a855f7; letter-spacing: 1px; text-transform: uppercase;">Also on DXBMovies</p>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                  <tr>
                    <td style="text-align: center; padding: 0 4px;">
                      <span style="display: inline-block; background: rgba(147,51,234,0.15); border: 1px solid rgba(147,51,234,0.3); color: #d1a5ff; font-size: 11px; font-weight: 600; padding: 6px 12px; border-radius: 20px; white-space: nowrap;">🤖 AI Movie Chat</span>
                    </td>
                    <td style="text-align: center; padding: 0 4px;">
                      <span style="display: inline-block; background: rgba(236,72,153,0.15); border: 1px solid rgba(236,72,153,0.3); color: #f9a8d4; font-size: 11px; font-weight: 600; padding: 6px 12px; border-radius: 20px; white-space: nowrap;">📝 Watchlists</span>
                    </td>
                    <td style="text-align: center; padding: 0 4px;">
                      <span style="display: inline-block; background: rgba(147,51,234,0.15); border: 1px solid rgba(147,51,234,0.3); color: #d1a5ff; font-size: 11px; font-weight: 600; padding: 6px 12px; border-radius: 20px; white-space: nowrap;">🎯 Matchmaker</span>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- ══════ FOOTER GRADIENT BAR ══════ -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f0d9a 0%, #9333ea 50%, #ec4899 100%); padding: 2px 0;"></td>
          </tr>

          <!-- ══════ FOOTER TEXT ══════ -->
          <tr>
            <td style="padding: 24px 40px; text-align: center; background-color: #080811; border-radius: 0 0 20px 20px;">
              <p style="margin: 0 0 6px 0; color: #4b5563; font-size: 11px; line-height: 1.7;">
                You're receiving this because you signed up at
                <a href="https://dxbmovie.online" style="color: #9333ea; text-decoration: none;">dxbmovie.online</a>
              </p>
              <p style="margin: 0; color: #374151; font-size: 11px;">
                © ${new Date().getFullYear()} DXB Movies | Tv Shows · Sent from
                <a href="mailto:hello@dxbmovie.online" style="color: #6b7280; text-decoration: none;">hello@dxbmovie.online</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- / Main card -->

      </td>
    </tr>
  </table>
  <!-- / Outer wrapper -->

</body>
</html>`;
}

/**
 * Builds the trending newsletter email (for periodic sends — not just welcome).
 * Same design; different subject and copy.
 */
export function getTrendingEmailHtml(userName: string, selectedMovies: Movie[]): string {
  // Reuse the same function with slightly different intro — done by the caller when building subject
  return getWelcomeEmailHtml(userName, selectedMovies);
}
