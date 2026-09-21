/**
 * Plans and what each one includes. This file is the single source of truth
 * for "what does Premium get" — the API, the pricing page and the tests all
 * read from it, so changing a plan's perks is a one-file change.
 */

export const PLAN_IDS = ["free", "premium", "premium_plus"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const PAID_PLAN_IDS = ["premium", "premium_plus"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

export const BILLING_INTERVALS = ["monthly", "yearly"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Paid perks. Each is also a feature flag with the same key, so it can be
 * switched on or off for everyone without a deploy. */
export const PERK_KEYS = [
  "unlimited_likes",
  "advanced_filters",
  "priority_recommendations",
  "profile_boost",
  "ai_deep_analysis",
  "read_receipts_insights",
] as const;
export type PerkKey = (typeof PERK_KEYS)[number];

export interface PlanLimits {
  /** Likes per UTC day. Only enforced while the `like_limits` flag is on. */
  dailyLikes: number;
  /** Max AI recommendations returned. Only enforced while `priority_recommendations` is on. */
  recommendations: number;
  /** Profile boosts per calendar month. */
  monthlyBoosts: number;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  perks: readonly PerkKey[];
  limits: PlanLimits;
  /** Minor units (cents / paise). */
  prices: Record<"usd" | "inr", Record<BillingInterval, number>>;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Everything you need to start meeting people",
    perks: [],
    limits: { dailyLikes: 20, recommendations: 5, monthlyBoosts: 0 },
    prices: { usd: { monthly: 0, yearly: 0 }, inr: { monthly: 0, yearly: 0 } },
  },
  premium: {
    id: "premium",
    name: "Premium",
    tagline: "Unlimited likes and sharper discovery",
    perks: ["unlimited_likes", "advanced_filters", "priority_recommendations", "read_receipts_insights"],
    limits: { dailyLikes: Number.POSITIVE_INFINITY, recommendations: 15, monthlyBoosts: 0 },
    prices: {
      usd: { monthly: 999, yearly: 9900 },
      inr: { monthly: 79900, yearly: 799000 },
    },
  },
  premium_plus: {
    id: "premium_plus",
    name: "Premium Plus",
    tagline: "The full AI matchmaking experience",
    perks: [
      "unlimited_likes",
      "advanced_filters",
      "priority_recommendations",
      "read_receipts_insights",
      "ai_deep_analysis",
      "profile_boost",
    ],
    limits: { dailyLikes: Number.POSITIVE_INFINITY, recommendations: 30, monthlyBoosts: 4 },
    prices: {
      usd: { monthly: 1999, yearly: 19900 },
      inr: { monthly: 159900, yearly: 1599000 },
    },
  },
};

export const PERK_LABELS: Record<PerkKey, { label: string; description: string }> = {
  unlimited_likes: { label: "Unlimited likes", description: "Like as many people as you want, every day." },
  advanced_filters: { label: "Advanced filters", description: "Filter Discover by age, gender and interests." },
  priority_recommendations: { label: "Priority recommendations", description: "See far more of your top AI matches." },
  profile_boost: { label: "Profile boost", description: "Get shown first in other people's AI recommendations." },
  ai_deep_analysis: { label: "AI deep analysis", description: "An in-depth read on your ideal partner, communication and growth areas." },
  read_receipts_insights: { label: "Read receipts insights", description: "See when and how quickly your messages are read." },
};

export function planRank(plan: PlanId): number {
  return PLAN_IDS.indexOf(plan);
}

export function planIncludes(plan: PlanId, perk: PerkKey): boolean {
  return PLANS[plan].perks.includes(perk);
}

/** The cheapest plan that includes `perk` (what an upgrade prompt should offer). */
export function cheapestPlanWith(perk: PerkKey): PaidPlanId {
  return (PAID_PLAN_IDS.find((plan) => planIncludes(plan, perk)) ?? "premium_plus") as PaidPlanId;
}

export function isPaidPlan(plan: string): plan is PaidPlanId {
  return (PAID_PLAN_IDS as readonly string[]).includes(plan);
}

export function isPlanId(plan: string): plan is PlanId {
  return (PLAN_IDS as readonly string[]).includes(plan);
}

/** Price for a plan in the currency a payment provider bills in. */
export function priceFor(
  plan: PaidPlanId,
  interval: BillingInterval,
  currency: "usd" | "inr",
): { amount: number; currency: "usd" | "inr" } {
  return { amount: PLANS[plan].prices[currency][interval], currency };
}
