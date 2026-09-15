import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { AccountHydrator } from "@/components/account-hydrator";
import { DelayedReturnPrompt } from "@/components/delayed-return-prompt";
import { PWAAutoPrompt } from "@/components/pwa-auto-prompt";
import { Providers } from "./providers";
import { SaveProfileNudge } from "@/components/save-profile-nudge";
import { ActorModal } from "@/components/actor-modal";
import { BRAND_NAME, BRAND_SHORT_NAME, SITE_ORIGIN, siteUrl } from "@/lib/brand";

const GA_ID = "G-GRWVXZCPD9";

export const metadata: Metadata = {
  title: `${BRAND_NAME} – AI Movie Companion & Tracker`,
  description:
    `${BRAND_NAME} is an AI-powered movie recommendation engine and tracker. Discover what to watch, get personalized recommendations, and track your favorite films. Note: ${BRAND_NAME} is a companion app, not a streaming platform.`,
  keywords: [
    // The brand terms lead, and they are the reason this rebrand exists: a
    // search for WaZhop should reach all three of its platforms, and this site
    // was the one that said nothing about WaZhop anywhere on it.
    "WaZhop Cinema",
    "WaZhop",
    "movie recommendations",
    "AI movie assistant",
    "movie tracker",
    "what to watch",
    "movie companion",
    "film discovery",
    "not a streaming site",
  ],
  metadataBase: new URL(SITE_ORIGIN),
  openGraph: {
    title: `${BRAND_NAME} – AI Movie Companion & Tracker`,
    description: "Your personal AI movie companion. Discover new movies, get personalized recommendations, and track your favorites. (Not a streaming platform).",
    url: SITE_ORIGIN,
    siteName: BRAND_NAME,
    type: "website",
    images: [
      {
        url: siteUrl("/icons/icon-512.png"),
        width: 512,
        height: 512,
        alt: `${BRAND_NAME} logo`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND_NAME} – AI Movie Companion`,
    description: "Discover the perfect film with your AI movie companion and tracker.",
    images: [siteUrl("/icons/icon-512.png")],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: BRAND_SHORT_NAME,
  },
  icons: {
    icon: [
      { url: "/icon-192.png?v=7", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=7", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png?v=7",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to critical third-party origins for faster resource loading */}
        <link rel="preconnect" href="https://image.tmdb.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.themoviedb.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://i.ytimg.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.youtube.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://image.tmdb.org" />
        <link rel="dns-prefetch" href="https://api.themoviedb.org" />
        <link rel="dns-prefetch" href="https://i.ytimg.com" />
        <link rel="dns-prefetch" href="https://www.youtube.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.clarity.ms" />
        {/* Google Analytics 4 */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}', {
              page_path: window.location.pathname,
            });
          `}
        </Script>
        {/* Structured Data to prevent misclassification as a streaming site */}
        <Script id="schema-org" type="application/ld+json" strategy="afterInteractive">
          {`
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "WaZhop Cinema",
              "url": "${SITE_ORIGIN}",
              "applicationCategory": "EntertainmentApplication",
              "description": "An AI-powered movie recommendation engine and tracker. WaZhop Cinema helps you discover what to watch next. It is a companion app and NOT a streaming platform or ticketing site.",
              "offers": {
                "@type": "Offer",
                "price": "0"
              }
            }
          `}
        </Script>
        {/* Microsoft Clarity for session recordings & heatmaps */}
        <Script id="clarity-script" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "xesvhedfdd");
          `}
        </Script>
        {/* Detect Android early to apply scaling */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (/Android/i.test(navigator.userAgent)) {
                document.documentElement.classList.add('is-android');
              }
            `,
          }}
        />
      </head>
      <body className="bg-background font-sans text-text-primary antialiased">
        <Providers>
          <AccountHydrator />
          <DelayedReturnPrompt />
          <PWAAutoPrompt />
          <SaveProfileNudge />
          {children}
          <ActorModal />
        </Providers>
      </body>
    </html>
  );
}
