"use client";

import Link from "next/link";
import { Crown, Info, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PLAN_NAMES, type Gate } from "@/lib/gate";
import { cn } from "@/lib/utils";

/**
 * What to show when the API says "not on your plan" (402), "you've hit today's
 * limit" (402) or "this feature is switched off" (403). One component so every
 * paywalled feature asks for an upgrade the same way.
 */
export function UpgradeNotice({ gate, className }: { gate: Gate; className?: string }) {
  if (gate.kind === "disabled") {
    return (
      <div className={cn("flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4", className)} role="status">
        <Info className="mt-0.5 size-4 shrink-0 text-white/50" />
        <p className="text-sm text-white/60">{gate.message}</p>
      </div>
    );
  }

  if (gate.kind === "upgrade" || gate.kind === "like-limit") {
    const plan = gate.kind === "upgrade" ? gate.requiredPlan : "premium";
    const resets =
      gate.kind === "like-limit" && gate.resetsAt
        ? ` Your likes reset ${new Date(gate.resetsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.`
        : "";

    return (
      <div className={cn("flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.07] p-4 sm:flex-row sm:items-center", className)} role="status">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white">
          {gate.kind === "like-limit" ? <Lock className="size-5" /> : <Crown className="size-5" />}
        </span>
        <p className="flex-1 text-sm text-white/75">
          {gate.message}
          {resets}
        </p>
        <Button asChild size="sm" className="shrink-0 rounded-full bg-gradient-brand px-4 text-white hover:opacity-90">
          <Link href="/pricing">See {PLAN_NAMES[plan]}</Link>
        </Button>
      </div>
    );
  }

  return null;
}
