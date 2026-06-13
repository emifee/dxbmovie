import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AccountHydrator } from "@/components/account-hydrator";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "DXBmovies.Ai",
  description:
    "Talk to your AI, discover what to watch, and remember everything you love.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DXB",
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
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="bg-background font-sans text-text-primary antialiased">
        <Providers>
          <AccountHydrator />
          {children}
        </Providers>
      </body>
    </html>
  );
}
