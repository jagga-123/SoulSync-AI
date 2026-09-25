import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";

import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { PlatformProvider } from "@/components/platform/platform-provider";
import { SITE_URL } from "@/lib/site";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Fraunces: the soft serif for headlines, names and emotional moments. Its italic is only used for the wordmark's
// "Sync" (and later one accent word per headline), so it is a separate face that is not preloaded.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const frauncesItalic = Fraunces({
  subsets: ["latin"],
  style: ["italic"],
  variable: "--font-display-italic",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SoulSync — Start with who you are",
    template: "%s | SoulSync",
  },
  description:
    "A conversation-first dating app. Chat with our AI for about ten minutes, then meet people who share your values and what you're looking for. Free to join.",
  keywords: [
    "AI dating app",
    "AI matchmaking",
    "SoulSync",
    "online dating",
  ],
  authors: [{ name: "SoulSync" }],
  creator: "SoulSync",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "SoulSync",
    title: "SoulSync — Start with who you are",
    description:
      "Chat with our AI for about ten minutes, then meet people who share your values and what you're looking for. Free to join.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SoulSync — Start with who you are",
    description:
      "Chat with our AI for about ten minutes, then meet people who share your values and what you're looking for. Free to join.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
};
// Each public page sets its own canonical (see the page files); none is set here so member-only pages don't inherit "/".

export const viewport: Viewport = {
  themeColor: "#150c1b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the bottom tab bar respect the iPhone home-indicator inset via env(safe-area-inset-bottom)
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${frauncesItalic.variable} h-full antialiased`}
    >
      <body className="relative min-h-full">
        <PlatformProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-primary-solid focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Skip to content
          </a>
          <Navbar />
          <main id="main" tabIndex={-1} className="relative z-10 outline-none">
            {children}
          </main>
          <Footer />
          <MobileTabBar />
        </PlatformProvider>
      </body>
    </html>
  );
}
