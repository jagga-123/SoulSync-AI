"use client";

import { usePlatform } from "@/components/platform/platform-provider";
import type { Gate } from "@/lib/gate";
import type { PerkKey, PlanId } from "@/types/platform";

/** The cheapest plan that includes each perk — mirrors PLANS in backend/src/features/plans.ts. */
const REQUIRED_PLAN: Partial<Record<PerkKey, PlanId>> = {
  ai_deep_analysis: "premium_plus",
  profile_boost: "premium_plus",
};

interface PerkGate {
  /** `false` until the member's plan/flags have loaded. */
  ready: boolean;
  /** The perk can be used right now — go ahead and call its endpoint. */
  allowed: boolean;
  /** When not allowed: the same notice the API's 402/403 response would have produced. */
  gate: Gate | null;
}

/**
 * Decides from the plan/flags the app has already loaded (`/billing/overview` → `features`) whether a paywalled endpoint is
 * worth calling. Without this, a free member's page load fires a request that is *certain* to be refused (402/403), and the
 * browser logs it as a console error. The API still enforces the gate — this only avoids the pointless round trip.
 */
export function usePerkGate(perk: PerkKey): PerkGate {
  const { features } = usePlatform();
  if (!features) return { ready: false, allowed: false, gate: null };

  const state = features.perks[perk];
  if (!state) return { ready: true, allowed: true, gate: null }; // unknown perk: let the API decide
  if (!state.enabled) {
    return { ready: true, allowed: false, gate: { kind: "disabled", feature: perk, message: "This feature isn't available right now." } };
  }
  if (!state.included) {
    return {
      ready: true,
      allowed: false,
      gate: {
        kind: "upgrade",
        feature: perk,
        requiredPlan: REQUIRED_PLAN[perk] ?? "premium",
        message: "This is a Premium feature. Upgrade to use it.",
      },
    };
  }
  return { ready: true, allowed: true, gate: null };
}
