import path from "node:path";
import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

// The browser talks to the API (REST) and the Socket.IO server over
// NEXT_PUBLIC_API_URL / NEXT_PUBLIC_SOCKET_URL, so those origins must be
// allowed by connect-src.
function origin(value: string | undefined, fallback: string): string {
  try {
    return new URL(value ?? fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
}
const apiOrigin = origin(process.env.NEXT_PUBLIC_API_URL, "http://localhost:5000/api");
const socketOrigin = origin(process.env.NEXT_PUBLIC_SOCKET_URL, apiOrigin);
const websocketOrigins = [apiOrigin, socketOrigin].map((o) => o.replace(/^http/, "ws"));

/**
 * Content-Security-Policy. Next.js bootstraps with inline scripts and styles,
 * so 'unsafe-inline' stays for those; everything else is locked to this site
 * plus the API. Profile photos may come from any https host (Cloudinary, or a
 * URL a member pasted), hence `img-src https:`, and from the API itself (locally stored uploads). Applied to production builds only —
 * the dev server needs eval for hot reloading.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https: ${apiOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${[...new Set([apiOrigin, socketOrigin, ...websocketOrigins])].join(" ")}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // Only meaningful (and only safe) when the API itself is served over https — it would
  // otherwise break a local production preview that talks to http://localhost.
  ...(apiOrigin.startsWith("https:") ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProduction
    ? [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "Content-Security-Policy", value: csp },
      ]
    : []),
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // Lets a separate build (e.g. the browser E2E stack) use its own folder without touching a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // The UI imports primitives from the "radix-ui" barrel; this bundles only the ones actually used.
  experimental: { optimizePackageImports: ["radix-ui"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
