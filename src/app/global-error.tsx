"use client";

import { useEffect } from "react";

import { API_URL } from "@/lib/env";

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it can't rely on the app's providers, fonts or components —
 * it's deliberately plain HTML with inline styles.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Plain fetch: the app's API client (and its providers) may be what broke.
    void fetch(`${API_URL}/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message.slice(0, 500),
        digest: error.digest,
        stack: error.stack?.slice(0, 4000),
        path: window.location.pathname,
        userAgent: navigator.userAgent.slice(0, 300),
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#150c1b", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>SoulSync hit a problem</h1>
          <p style={{ maxWidth: 420, margin: 0, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
            Something went wrong while loading the app, and we&apos;ve been notified. Please try again.
          </p>
          {error.digest && <p style={{ margin: 0, fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Reference: {error.digest}</p>}
          <button
            onClick={reset}
            style={{ padding: "10px 24px", borderRadius: 999, border: 0, color: "#fff", fontWeight: 600, cursor: "pointer", background: "linear-gradient(135deg,#ff4d8d,#7c3aed)" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
