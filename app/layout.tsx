import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { AccountHydrator } from "@/components/account-hydrator";
import { PWAAutoPrompt } from "@/components/pwa-auto-prompt";
import { Providers } from "./providers";

const GA_ID = "G-GRWVXZCPD9";

export const metadata: Metadata = {
  title: "DXBmovies – AI Movie Companion",
  description:
    "Talk to your AI movie companion, discover what to watch tonight, and remember everything you love. DXBmovies – your personal cinema guide.",
  metadataBase: new URL("https://dxbmovie.online"),
  openGraph: {
    title: "DXBmovies – AI Movie Companion",
    description: "Discover movies and TV shows with your personal AI companion.",
    url: "https://dxbmovie.online",
    siteName: "DXBmovies",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DXBmovies – AI Movie Companion",
    description: "Discover movies and TV shows with your personal AI companion.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DXB",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
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
      </head>
      <body className="bg-background font-sans text-text-primary antialiased">
        <Providers>
          <AccountHydrator />
          <PWAAutoPrompt />
          {children}
        </Providers>
      </body>
    </html>
  );
}
