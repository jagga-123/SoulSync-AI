import { Types } from "mongoose";
import { childLogger } from "../config/logger";
import { getEffectivePlan, isSubscriptionLive } from "../features/entitlements";
import {
  PLANS,
  planRank,
  type BillingInterval,
  type PaidPlanId,
  type PlanId,
} from "../features/plans";
import { Subscription, type ISubscription, type PaymentProviderName } from "../models/Subscription.model";
import { events } from "../platform/events";

const log = childLogger("subscriptions");

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionView {
  plan: PlanId;
  planName: string;
  status: "free" | ISubscription["status"];
  source: "paid" | "grant" | null;
  provider: PaymentProviderName | null;
  billingInterval: BillingInterval | null;
  startDate: Date | null;
  expiryDate: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** What the billing page shows: the user's effective plan and its lifecycle. */
export async function getSubscriptionView(userId: string): Promise<SubscriptionView> {
  const { plan, subscription } = await getEffectivePlan(userId);
  if (!subscription) {
    return {
      plan: "free",
      planName: PLANS.free.name,
      status: "free",
      source: null,
      provider: null,
      billingInterval: null,
      startDate: null,
      expiryDate: null,
      cancelAtPeriodEnd: false,
    };
  }
  return {
    plan,
    planName: PLANS[plan].name,
    status: subscription.status,
    source: subscription.source,
    provider: subscription.provider ?? null,
    billingInterval: subscription.billingInterval ?? null,
    startDate: subscription.startDate,
    expiryDate: subscription.expiryDate,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  };
}

/** The user's paid (provider-billed) subscription document, if any — live or not. */
export async function getPaidSubscription(userId: string): Promise<ISubscription | null> {
  return Subscription.findOne({ userId: new Types.ObjectId(userId), source: "paid" });
}

/**
 * Gives complimentary time on a plan (referral rewards, admin comps). If the
 * user already has a live grant of the same or a higher plan, the new days are
 * added to it; otherwise the grant is (re)started.
 */
export async function grantPlan(
  userId: string,
  plan: PaidPlanId,
  days: number,
  reason: string,
): Promise<ISubscription> {
  const userObjectId = new Types.ObjectId(userId);
  const before = (await getEffectivePlan(userId)).plan;
  const existing = await Subscription.findOne({ userId: userObjectId, source: "grant" });
  const now = new Date();

  let subscription: ISubscription;
  if (existing && isSubscriptionLive(existing, now) && planRank(existing.plan) >= planRank(plan)) {
    existing.expiryDate = new Date(existing.expiryDate.getTime() + days * DAY_MS);
    existing.grantReason = reason;
    subscription = await existing.save();
  } else {
    subscription = (await Subscription.findOneAndUpdate(
      { userId: userObjectId, source: "grant" },
      {
        $set: {
          plan,
          status: "active",
          startDate: now,
          expiryDate: new Date(now.getTime() + days * DAY_MS),
          cancelAtPeriodEnd: false,
          grantReason: reason,
        },
        $setOnInsert: { userId: userObjectId, source: "grant" },
      },
      { upsert: true, new: true },
    )) as ISubscription;
  }

  events.emit("subscription.changed", { userId, plan: (await getEffectivePlan(userId)).plan, previousPlan: before, reason: "grant" });
  log.info({ userId, plan, days, reason }, "complimentary plan granted");
  return subscription;
}

/** Ends a complimentary grant immediately (admin revoke). */
export async function revokeGrant(userId: string): Promise<boolean> {
  const before = (await getEffectivePlan(userId)).plan;
  const result = await Subscription.updateOne(
    { userId: new Types.ObjectId(userId), source: "grant" },
    { $set: { status: "expired", expiryDate: new Date() } },
  );
  if (result.modifiedCount > 0) {
    events.emit("subscription.changed", { userId, plan: (await getEffectivePlan(userId)).plan, previousPlan: before, reason: "admin" });
  }
  return result.modifiedCount > 0;
}

/**
 * Marks subscriptions whose paid period has ended as expired and tells the
 * user. Runs on a schedule; webhooks usually get there first, this is the
 * backstop for providers that never send (or drop) the final event.
 */
export async function expireSubscriptions(now = new Date()): Promise<{ expired: number }> {
  const due = await Subscription.find({ expiryDate: { $lte: now }, status: { $ne: "expired" } });
  let expired = 0;

  for (const subscription of due) {
    const userId = subscription.userId.toString();
    const previousPlan = subscription.plan;
    subscription.status = "expired";
    await subscription.save();
    expired++;

    const { plan } = await getEffectivePlan(userId);
    events.emit("subscription.changed", { userId, plan, previousPlan, reason: "expired" });
  }
  return { expired };
}
