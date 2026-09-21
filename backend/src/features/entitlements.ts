import { Types } from "mongoose";
import { ApiError } from "../utils/ApiError";
import { Subscription, type ISubscription } from "../models/Subscription.model";
import { isFeatureEnabled } from "./feature.service";
import type { FeatureKey } from "./registry";
import {
  PERK_KEYS,
  PLANS,
  cheapestPlanWith,
  planIncludes,
  planRank,
  type PerkKey,
  type PlanId,
  type PlanLimits,
} from "./plans";

/** A subscription grants access while its expiry is in the future. (A
 * cancelled subscription therefore keeps working until the period the user
 * already paid for ends.) */
export function isSubscriptionLive(subscription: Pick<ISubscription, "expiryDate" | "status">, now = new Date()): boolean {
  return subscription.expiryDate.getTime() > now.getTime() && subscription.status !== "expired";
}

export interface EffectivePlan {
  plan: PlanId;
  subscription: ISubscription | null;
}

/** The best plan among a user's live subscriptions (paid and complimentary), else Free. */
export async function getEffectivePlan(userId: string): Promise<EffectivePlan> {
  const subscriptions = await Subscription.find({ userId: new Types.ObjectId(userId) });
  const live = subscriptions.filter((subscription) => isSubscriptionLive(subscription));
  if (live.length === 0) return { plan: "free", subscription: null };

  const best = live.reduce((a, b) => (planRank(b.plan) > planRank(a.plan) ? b : a));
  return { plan: best.plan, subscription: best };
}

export interface PerkState {
  /** The feature flag is on (perk exists at all right now). */
  enabled: boolean;
  /** The user's plan includes it. */
  included: boolean;
  /** enabled && included — the user can use it now. */
  available: boolean;
}

export interface Entitlements {
  plan: PlanId;
  limits: PlanLimits;
  perks: Record<PerkKey, PerkState>;
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const { plan } = await getEffectivePlan(userId);
  const enabledFlags = await Promise.all(PERK_KEYS.map((perk) => isFeatureEnabled(perk)));

  const perks = {} as Record<PerkKey, PerkState>;
  PERK_KEYS.forEach((perk, index) => {
    const enabled = enabledFlags[index] as boolean;
    const included = planIncludes(plan, perk);
    perks[perk] = { enabled, included, available: enabled && included };
  });

  return { plan, limits: PLANS[plan].limits, perks };
}

/** True when the perk's flag is on and the user's plan includes it. */
export async function hasPerk(userId: string, perk: PerkKey): Promise<boolean> {
  if (!(await isFeatureEnabled(perk))) return false;
  const { plan } = await getEffectivePlan(userId);
  return planIncludes(plan, perk);
}

/**
 * Throws unless the user can use `perk`:
 *   403 FEATURE_DISABLED   — the flag is off (nobody can use it right now)
 *   402 UPGRADE_REQUIRED   — the flag is on but the user's plan doesn't include it
 */
export async function assertPerk(userId: string, perk: PerkKey): Promise<void> {
  if (!(await isFeatureEnabled(perk))) {
    throw new ApiError(403, "This feature isn't available right now.", { code: "FEATURE_DISABLED", feature: perk });
  }
  const { plan } = await getEffectivePlan(userId);
  if (!planIncludes(plan, perk)) {
    throw new ApiError(402, "This is a Premium feature. Upgrade to use it.", {
      code: "UPGRADE_REQUIRED",
      feature: perk,
      currentPlan: plan,
      requiredPlan: cheapestPlanWith(perk),
    });
  }
}

/** Throws 403 FEATURE_DISABLED unless a (non-perk) flag is on. */
export async function assertFeature(key: FeatureKey): Promise<void> {
  if (!(await isFeatureEnabled(key))) {
    throw new ApiError(403, "This feature isn't available right now.", { code: "FEATURE_DISABLED", feature: key });
  }
}
