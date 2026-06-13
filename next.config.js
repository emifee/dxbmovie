/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // runtime image only needs the traced node_modules, not the full install.
  output: "standalone",
  optimizeFonts: false,
  images: {
    remotePatterns: [
      // TMDB poster/backdrop images
      { protocol: "https", hostname: "image.tmdb.org" },
      // Google profile photos
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

module.exports = nextConfig;
