import { PERK_KEYS, type PerkKey } from "./plans";

export type FeatureCategory = "core" | "premium" | "growth" | "safety";

export interface FeatureDefinition {
  key: string;
  label: string;
  description: string;
  category: FeatureCategory;
  /** State when nothing overrides it. Everything that changes existing
   * behaviour or costs money defaults to OFF. */
  defaultEnabled: boolean;
}

/**
 * Every feature flag in the platform. A flag's live value resolves as:
 *   admin dashboard (database)  >  FEATURE_FLAGS env var  >  defaultEnabled here.
 *
 * Paid features default OFF: nothing that could charge a user or cost API
 * spend is reachable until someone deliberately turns it on.
 */
export const FEATURE_DEFINITIONS = [
  // ---- core ----
  { key: "notifications", label: "In-app notifications", description: "Notification center and real-time alerts.", category: "core", defaultEnabled: true },
  { key: "email_notifications", label: "Email notifications", description: "Match alerts, message alerts and the weekly compatibility report.", category: "core", defaultEnabled: true },
  { key: "billing", label: "Billing & checkout", description: "Let users start, upgrade and cancel Premium subscriptions.", category: "core", defaultEnabled: false },

  // ---- premium perks (each gated by plan, too) ----
  { key: "like_limits", label: "Free-plan like limit", description: "Cap free users at 20 likes per day (Premium is exempt when 'Unlimited likes' is on).", category: "premium", defaultEnabled: false },
  { key: "unlimited_likes", label: "Unlimited likes (perk)", description: "Premium plans are exempt from the daily like limit.", category: "premium", defaultEnabled: false },
  { key: "advanced_filters", label: "Advanced filters (perk)", description: "Age, gender and interest filters in Discover.", category: "premium", defaultEnabled: false },
  { key: "priority_recommendations", label: "Priority recommendations (perk)", description: "Free users see 5 AI recommendations; paid plans see 15–30.", category: "premium", defaultEnabled: false },
  { key: "profile_boost", label: "Profile boost (perk)", description: "Boosted profiles rank first in other people's AI recommendations.", category: "premium", defaultEnabled: false },
  { key: "ai_deep_analysis", label: "AI deep analysis (perk)", description: "In-depth personality analysis. Uses the AI provider when one is configured (paid API usage).", category: "premium", defaultEnabled: false },
  { key: "read_receipts_insights", label: "Read receipts insights (perk)", description: "Message read-time analytics.", category: "premium", defaultEnabled: false },

  // ---- growth ----
  { key: "referrals", label: "Referral program", description: "Referral codes, invites and tracking.", category: "growth", defaultEnabled: true },
  { key: "referral_rewards", label: "Referral rewards payout", description: "Grant Premium time when referral milestones are reached. Tracking works without this.", category: "growth", defaultEnabled: false },
  { key: "waitlist_mode", label: "Waitlist mode", description: "Registration requires an invite; visitors join a waitlist instead.", category: "growth", defaultEnabled: false },
  { key: "profile_views", label: "Profile view tracking", description: "Record profile views and notify people.", category: "growth", defaultEnabled: true },

  // ---- safety ----
  { key: "reports", label: "User reports", description: "Let users report others into the moderation queue.", category: "safety", defaultEnabled: true },
  { key: "blocking", label: "Blocking", description: "Let users block others.", category: "safety", defaultEnabled: true },
] as const satisfies readonly FeatureDefinition[];

export type FeatureKey = (typeof FEATURE_DEFINITIONS)[number]["key"];

export const FEATURE_KEYS: readonly FeatureKey[] = FEATURE_DEFINITIONS.map((definition) => definition.key);

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(value);
}

export function getDefinition(key: FeatureKey): FeatureDefinition {
  return FEATURE_DEFINITIONS.find((definition) => definition.key === key) as FeatureDefinition;
}

// Every perk must exist as a flag — this fails the build if one is added to a
// plan without being registered here.
const _perkFlagsExist: readonly PerkKey[] = PERK_KEYS;
void (_perkFlagsExist satisfies readonly FeatureKey[]);
