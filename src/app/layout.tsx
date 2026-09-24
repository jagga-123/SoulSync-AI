import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import { SmoothScrollProvider } from "@/components/layout/smooth-scroll-provider";
import { AuroraBackground } from "@/components/effects/aurora-background";
import { SpotlightCursor } from "@/components/effects/spotlight-cursor";
import { PageIntro } from "@/components/effects/page-intro";
import { ScrollProgress } from "@/components/layout/scroll-progress";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PlatformProvider } from "@/components/platform/platform-provider";
import { SITE_URL } from "@/lib/site";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SoulSync AI — Start with who you are",
    template: "%s | SoulSync AI",
  },
  description:
    "A conversation-first dating app. Chat with our AI for about ten minutes, then meet people who share your values and what you're looking for. Free to join.",
  keywords: [
    "AI dating app",
    "AI matchmaking",
    "SoulSync AI",
    "online dating",
  ],
  authors: [{ name: "SoulSync AI" }],
  creator: "SoulSync AI",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "SoulSync AI",
    title: "SoulSync AI — Start with who you are",
    description:
      "Chat with our AI for about ten minutes, then meet people who share your values and what you're looking for. Free to join.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SoulSync AI — Start with who you are",
    description:
      "Chat with our AI for about ten minutes, then meet people who share your values and what you're looking for. Free to join.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#050816",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="relative min-h-full">
        <SmoothScrollProvider>
          <PageIntro />
          <AuroraBackground />
          <SpotlightCursor />
          <ScrollProgress />
          <PlatformProvider>
            <Navbar />
            <main className="relative z-10">{children}</main>
            <Footer />
          </PlatformProvider>
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
