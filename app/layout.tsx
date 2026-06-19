import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AccountHydrator } from "@/components/account-hydrator";
import { PWAAutoPrompt } from "@/components/pwa-auto-prompt";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "DXBmovies",
  description:
    "Talk to your AI, discover what to watch, and remember everything you love.",
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
