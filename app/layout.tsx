import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { AccountHydrator } from "@/components/account-hydrator";
import { PWAAutoPrompt } from "@/components/pwa-auto-prompt";
import { Providers } from "./providers";

const GA_ID = "G-GRWVXZCPD9";

export const metadata: Metadata = {
  title: "DXBmovies – Ultimate Movie Companion",
  description:
    "Talk to your ultimate movie companion, discover what to watch tonight, and remember everything you love. DXBmovies – your personal cinema guide.",
  metadataBase: new URL("https://dxbmovies.online"),
  openGraph: {
    title: "DXBmovies – Ultimate Movie Companion",
    description: "Discover movies and TV shows with your personal ultimate movie companion.",
    url: "https://dxbmovies.online",
    siteName: "DXBmovies",
    type: "website",
    images: [
      {
        url: "https://dxbmovies.online/icons/icon-512.png",
        width: 512,
        height: 512,
        alt: "DXB Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DXBmovies – Ultimate Movie Companion",
    description: "Your ultimate movie companion for discovering the perfect film.",
    images: ["https://dxbmovies.online/icons/icon-512.png"],
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
