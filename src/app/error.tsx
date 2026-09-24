"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/api/platform";

/**
 * Catches render errors anywhere below the root layout, shows a friendly
 * recovery screen, and reports the failure to the API (which logs it and
 * forwards it to the error tracker). Nothing sensitive is sent: just the
 * message, digest, a trimmed stack and the path.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void reportClientError({
      message: error.message.slice(0, 500),
      digest: error.digest,
      stack: error.stack?.slice(0, 4000),
      path: window.location.pathname,
      userAgent: navigator.userAgent.slice(0, 300),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 px-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-brand shadow-lg shadow-primary/25">
        <TriangleAlert className="size-6 text-white" />
      </span>
      <div>
        <h1 className="font-display text-2xl font-semibold text-white">Something went wrong</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
          We hit an unexpected problem and have been notified. You can try again, or head back to your dashboard.
        </p>
        {error.digest && <p className="mt-3 font-mono text-xs text-white/60">Reference: {error.digest}</p>}
      </div>
      <div className="flex gap-3">
        <Button onClick={reset} className="gap-2 rounded-full bg-gradient-brand text-white hover:opacity-90">
          <RotateCcw className="size-4" />
          Try again
        </Button>
        <Button asChild variant="outline" className="rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
