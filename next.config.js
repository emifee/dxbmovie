// Build identity, resolved at BUILD time and inlined into the bundle so the running
// server can report exactly which code it is. The server itself never shells out to git
// (the deployed standalone artifact has no .git directory), hence the try/catch.
function buildInfo() {
  const read = (cmd) => {
    try {
      return require("child_process").execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      return "";
    }
  };
  return {
    BUILD_COMMIT: process.env.BUILD_COMMIT || read("git rev-parse HEAD") || "unknown",
    BUILD_TAG: process.env.BUILD_TAG || read("git describe --tags --always --dirty") || "unknown",
    BUILD_DIRTY: process.env.BUILD_DIRTY || (read("git status --porcelain") ? "true" : "false"),
    BUILD_TIME: process.env.BUILD_TIME || new Date().toISOString(),
  };
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: buildInfo(),

  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // runtime image only needs the traced node_modules, not the full install.
  output: "standalone",

  // Enable gzip compression from the Node server itself
  compress: true,

  optimizeFonts: false,

  images: {
    remotePatterns: [
      // TMDB poster/backdrop images
      { protocol: "https", hostname: "image.tmdb.org" },
      // Google profile photos
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
    // Reduce image sizes sent to clients
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    formats: ["image/webp"],
  },

  // Cache headers for all responses
  async headers() {
    return [
      // Static assets (JS, CSS, fonts) — cache aggressively (1 year, immutable)
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Icons and public assets — cache for 1 week
      {
        source: "/icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
      // Service worker and manifest — short cache so updates propagate
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
      // API routes — allow CDN edge caching with stale-while-revalidate
      {
        source: "/api/movies/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=300, stale-while-revalidate=600",
          },
        ],
      },
      // Optimized images — cache for 1 day
      {
        source: "/_next/image",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=43200",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

