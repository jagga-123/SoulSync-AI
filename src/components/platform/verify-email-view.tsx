"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AuthCard } from "@/components/auth/auth-card";
import { verifyEmail } from "@/lib/api/platform";
import { getToken } from "@/lib/auth-storage";
import { errorMessage } from "@/lib/gate";

type State = { status: "verifying" } | { status: "done" } | { status: "error"; message: string };

/** Landing page for the link in the verification email. */
export function VerifyEmailView() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<State>(token ? { status: "verifying" } : { status: "error", message: "This verification link is incomplete. Open the link from your email again." });
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // React strict mode runs effects twice in development
    verifyEmail(token)
      .then(() => setState({ status: "done" }))
      .catch((err) => setState({ status: "error", message: errorMessage(err, "We couldn't verify your email.") }));
  }, [token]);

  const signedIn = typeof window !== "undefined" && Boolean(getToken());

  return (
    <AuthCard title={state.status === "done" ? "Email verified" : state.status === "error" ? "Verification problem" : "Verifying your email…"}>
      <div role="status" className="flex flex-col items-center gap-5 text-center">
        {state.status === "verifying" && <Loader2 className="size-10 animate-spin text-white/50" />}
        {state.status === "done" && (
          <>
            <CircleCheck className="size-12 text-accent" />
            <p className="text-sm text-white/65">Thanks! Your email address is confirmed — you&apos;ll now get match and message alerts by email.</p>
            <Button asChild className="rounded-full bg-gradient-brand text-white hover:opacity-90">
              <Link href={signedIn ? "/dashboard" : "/login"}>{signedIn ? "Go to dashboard" : "Log in"}</Link>
            </Button>
          </>
        )}
        {state.status === "error" && (
          <>
            <CircleAlert className="size-12 text-destructive" />
            <p className="text-sm text-white/65">{state.message}</p>
            <Button asChild variant="outline" className="rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
              <Link href={signedIn ? "/settings" : "/login"}>{signedIn ? "Request a new link in Settings" : "Log in to request a new link"}</Link>
            </Button>
          </>
        )}
      </div>
    </AuthCard>
  );
}
