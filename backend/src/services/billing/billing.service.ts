import type { IncomingHttpHeaders } from "node:http";
import { Types } from "mongoose";
import { appUrl, env } from "../../config/env";
import { childLogger } from "../../config/logger";
import { assertFeature, getEffectivePlan, isSubscriptionLive } from "../../features/entitlements";
import { isFeatureEnabled } from "../../features/feature.service";
import {
  PERK_LABELS,
  PLANS,
  PLAN_IDS,
  isPaidPlan,
  planRank,
  type BillingInterval,
  type PaidPlanId,
  type PlanId,
} from "../../features/plans";
import { Payment } from "../../models/Payment.model";
import { Subscription, type ISubscription, type PaymentProviderName } from "../../models/Subscription.model";
import { User } from "../../models/User.model";
import { WebhookEvent } from "../../models/WebhookEvent.model";
import { events } from "../../platform/events";
import { paymentsTotal, webhooksTotal } from "../../platform/metrics";
import { ApiError } from "../../utils/ApiError";
import { getSubscriptionView } from "../subscription.service";
import { MockProvider, buildMockCheckoutEvents, verifyMockSession } from "./mock.provider";
import { RazorpayProvider } from "./razorpay.provider";
import { StripeProvider } from "./stripe.provider";
import { RetryableWebhookError, WebhookVerificationError, type NormalizedBillingEvent, type PaymentProvider } from "./types";

const log = childLogger("billing");
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

let provider: PaymentProvider | null | undefined;

/** The configured payment provider, or null when billing isn't set up. */
export function getPaymentProvider(): PaymentProvider | null {
  if (provider === undefined) {
    switch (env.PAYMENT_PROVIDER) {
      case "stripe":
        provider = new StripeProvider();
        break;
      case "razorpay":
        provider = new RazorpayProvider();
        break;
      case "mock":
        provider = new MockProvider();
        break;
      default:
        provider = null;
    }
  }
  return provider;
}

export function getProviderByName(name: string): PaymentProvider | null {
  const configured = getPaymentProvider();
  return configured && configured.name === name ? configured : null;
}

function requireProvider(): PaymentProvider {
  const configured = getPaymentProvider();
  if (!configured) {
    throw new ApiError(503, "Billing isn't set up yet.", { code: "BILLING_UNAVAILABLE" });
  }
  return configured;
}

// ---------------------------------------------------------------------------
// Catalog + overview
// ---------------------------------------------------------------------------

/** Public: plans, prices in the provider's currency, and which perks are live. */
export async function getPlanCatalog() {
  const configured = getPaymentProvider();
  const currency = configured?.currency ?? "usd";
  const billingEnabled = Boolean(configured) && (await isFeatureEnabled("billing"));

  const perkStates = await Promise.all(
    Object.keys(PERK_LABELS).map(async (key) => [key, await isFeatureEnabled(key as keyof typeof PERK_LABELS)] as const),
  );
  const perkEnabled = new Map(perkStates);

  return {
    billingEnabled,
    provider: configured?.name ?? null,
    currency,
    plans: PLAN_IDS.map((id) => {
      const plan = PLANS[id];
      return {
        id,
        name: plan.name,
        tagline: plan.tagline,
        prices: plan.prices[currency],
        perks: plan.perks.map((perk) => ({ key: perk, ...PERK_LABELS[perk], live: perkEnabled.get(perk) ?? false })),
        limits: {
          dailyLikes: Number.isFinite(plan.limits.dailyLikes) ? plan.limits.dailyLikes : null,
          recommendations: plan.limits.recommendations,
          monthlyBoosts: plan.limits.monthlyBoosts,
        },
      };
    }),
  };
}

export async function getBillingOverview(userId: string) {
  const [catalog, subscription] = await Promise.all([getPlanCatalog(), getSubscriptionView(userId)]);
  return { ...catalog, subscription };
}

// ---------------------------------------------------------------------------
// Checkout / upgrade / cancel
// ---------------------------------------------------------------------------

async function loadPaidSubscription(userId: string): Promise<ISubscription | null> {
  return Subscription.findOne({ userId: new Types.ObjectId(userId), source: "paid" });
}

export async function createCheckout(userId: string, plan: string, interval: BillingInterval) {
  await assertFeature("billing");
  const billing = requireProvider();
  if (!isPaidPlan(plan)) throw ApiError.badRequest("Choose Premium or Premium Plus.");

  const user = await User.findById(userId).select("email");
  if (!user) throw ApiError.notFound("User not found");

  const existing = await loadPaidSubscription(userId);
  if (existing && isSubscriptionLive(existing)) {
    throw new ApiError(409, "You already have an active subscription. Manage it from Billing.", {
      code: planRank(plan) > planRank(existing.plan) ? "USE_UPGRADE" : "ALREADY_SUBSCRIBED",
      currentPlan: existing.plan,
    });
  }

  const checkout = await billing.createCheckout({
    userId,
    email: user.email,
    plan,
    interval,
    successUrl: `${appUrl}/billing?checkout=success`,
    cancelUrl: `${appUrl}/pricing?checkout=cancelled`,
    existingCustomerId: existing?.providerCustomerId,
  });
  log.info({ userId, plan, interval, provider: billing.name }, "checkout created");
  return { url: checkout.url, provider: billing.name };
}

export async function upgradePlan(userId: string, plan: string) {
  await assertFeature("billing");
  const billing = requireProvider();
  if (!isPaidPlan(plan)) throw ApiError.badRequest("Choose Premium or Premium Plus.");

  const subscription = await loadPaidSubscription(userId);
  if (!subscription || !isSubscriptionLive(subscription) || !subscription.providerSubscriptionId) {
    throw ApiError.conflict("You don't have an active subscription to upgrade. Start one from Pricing.");
  }
  if (planRank(plan) <= planRank(subscription.plan)) {
    throw ApiError.badRequest("Upgrades go to a higher plan. To downgrade, cancel and choose a lower plan at renewal.");
  }
  if (subscription.cancelAtPeriodEnd) {
    throw ApiError.conflict("Your subscription is set to end — you can upgrade after it does.");
  }

  const interval = subscription.billingInterval ?? "monthly";
  const previousPlan = subscription.plan;
  const result = await billing.changePlan({ providerSubscriptionId: subscription.providerSubscriptionId }, plan, interval);

  subscription.plan = plan;
  if (result.periodEnd) subscription.expiryDate = result.periodEnd;
  await subscription.save();

  if (result.payment) {
    await recordPayment(userId, subscription, billing.name, result.payment, "succeeded");
  }
  events.emit("subscription.changed", { userId, plan, previousPlan, reason: "upgrade" });
  return getSubscriptionView(userId);
}

export async function cancelSubscription(userId: string) {
  const billing = requireProvider();

  const subscription = await loadPaidSubscription(userId);
  if (!subscription || !isSubscriptionLive(subscription) || !subscription.providerSubscriptionId) {
    throw ApiError.conflict("You don't have an active paid subscription to cancel.");
  }
  if (subscription.cancelAtPeriodEnd) return getSubscriptionView(userId); // already scheduled — idempotent

  await billing.cancelAtPeriodEnd({ providerSubscriptionId: subscription.providerSubscriptionId });

  subscription.cancelAtPeriodEnd = true;
  subscription.canceledAt = new Date();
  await subscription.save();

  events.emit("subscription.changed", {
    userId,
    plan: (await getEffectivePlan(userId)).plan,
    previousPlan: subscription.plan,
    reason: "cancel_scheduled",
  });
  return getSubscriptionView(userId);
}

export async function listPayments(userId: string, page: number, limit: number) {
  const filter = { userId: new Types.ObjectId(userId) };
  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Payment.countDocuments(filter),
  ]);
  return {
    payments: payments.map((payment) => payment.toJSON()),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

// ---------------------------------------------------------------------------
// Applying provider events (webhooks and the mock checkout share this path)
// ---------------------------------------------------------------------------

async function recordPayment(
  userId: string,
  subscription: ISubscription | null,
  providerName: PaymentProviderName,
  payment: NonNullable<NormalizedBillingEvent["payment"]>,
  status: "succeeded" | "failed",
): Promise<void> {
  const plan = subscription?.plan ?? "premium";
  try {
    await Payment.create({
      userId: new Types.ObjectId(userId),
      subscriptionId: subscription?._id,
      provider: providerName,
      providerPaymentId: payment.providerPaymentId,
      plan,
      interval: subscription?.billingInterval,
      amount: payment.amount,
      currency: payment.currency,
      status,
      description: `${PLANS[plan].name}${subscription?.billingInterval ? ` (${subscription.billingInterval})` : ""}`,
      receiptUrl: payment.receiptUrl,
      paidAt: status === "succeeded" ? new Date() : undefined,
    });
    paymentsTotal.inc({ provider: providerName, status });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err; // already recorded — a redelivered webhook
  }
}

const PROVISIONAL_PERIOD_MS: Record<BillingInterval, number> = { monthly: 31 * DAY_MS, yearly: 366 * DAY_MS };

async function resolveUserId(providerName: PaymentProviderName, event: NormalizedBillingEvent): Promise<string | null> {
  if (event.userId && Types.ObjectId.isValid(event.userId)) return event.userId;
  if (event.providerSubscriptionId) {
    const known = await Subscription.findOne({ provider: providerName, providerSubscriptionId: event.providerSubscriptionId });
    if (known) return known.userId.toString();
  }
  return null;
}

async function applyEvent(providerName: PaymentProviderName, event: NormalizedBillingEvent): Promise<void> {
  const userId = await resolveUserId(providerName, event);
  if (!userId) {
    // e.g. an invoice arriving before its checkout event — let the provider retry.
    throw new RetryableWebhookError(`Can't link ${event.type} (${event.id}) to a user yet`);
  }
  if (!(await User.exists({ _id: userId }))) {
    log.warn({ userId, event: event.id }, "billing event for a deleted user — ignoring");
    return;
  }

  const userObjectId = new Types.ObjectId(userId);
  let subscription = await Subscription.findOne({ userId: userObjectId, source: "paid" });
  const previousPlan = (await getEffectivePlan(userId)).plan;
  const now = new Date();

  const ensureSubscription = (): ISubscription => {
    if (!subscription) {
      const interval = event.interval ?? "monthly";
      subscription = new Subscription({
        userId: userObjectId,
        source: "paid",
        plan: event.plan ?? "premium",
        status: "active",
        billingInterval: interval,
        provider: providerName,
        startDate: now,
        expiryDate: event.periodEnd ?? new Date(now.getTime() + PROVISIONAL_PERIOD_MS[interval]),
      });
    }
    return subscription;
  };

  switch (event.type) {
    case "subscription_started": {
      const sub = ensureSubscription();
      sub.plan = event.plan ?? sub.plan;
      sub.billingInterval = event.interval ?? sub.billingInterval;
      sub.provider = providerName;
      sub.providerSubscriptionId = event.providerSubscriptionId ?? sub.providerSubscriptionId;
      sub.providerCustomerId = event.providerCustomerId ?? sub.providerCustomerId;
      sub.status = "active";
      sub.cancelAtPeriodEnd = false;
      sub.canceledAt = undefined;
      sub.startDate = now;
      sub.expiryDate = event.periodEnd ?? new Date(now.getTime() + PROVISIONAL_PERIOD_MS[sub.billingInterval ?? "monthly"]);
      await sub.save();
      events.emit("subscription.changed", { userId, plan: (await getEffectivePlan(userId)).plan, previousPlan, reason: "checkout" });
      break;
    }

    case "payment_succeeded": {
      const sub = ensureSubscription();
      sub.provider = providerName;
      sub.providerSubscriptionId = event.providerSubscriptionId ?? sub.providerSubscriptionId;
      sub.providerCustomerId = event.providerCustomerId ?? sub.providerCustomerId;
      sub.status = "active";
      if (event.periodEnd && event.periodEnd > sub.expiryDate) sub.expiryDate = event.periodEnd;
      await sub.save();
      if (event.payment) await recordPayment(userId, sub, providerName, event.payment, "succeeded");
      if (previousPlan === "free") {
        events.emit("subscription.changed", { userId, plan: (await getEffectivePlan(userId)).plan, previousPlan, reason: "checkout" });
      }
      break;
    }

    case "payment_failed": {
      if (subscription) {
        subscription.status = "past_due";
        await subscription.save();
      }
      if (event.payment) await recordPayment(userId, subscription, providerName, event.payment, "failed");
      events.emit("subscription.changed", { userId, plan: (await getEffectivePlan(userId)).plan, previousPlan, reason: "payment_failed" });
      break;
    }

    case "subscription_updated": {
      if (!subscription) throw new RetryableWebhookError("subscription_updated arrived before the subscription exists");
      const wasCancelScheduled = subscription.cancelAtPeriodEnd;
      if (event.plan) subscription.plan = event.plan;
      if (event.interval) subscription.billingInterval = event.interval;
      if (event.status) subscription.status = event.status === "canceled" ? "canceled" : event.status;
      if (event.cancelAtPeriodEnd !== undefined) subscription.cancelAtPeriodEnd = event.cancelAtPeriodEnd;
      if (event.periodEnd) subscription.expiryDate = event.periodEnd;
      if (subscription.cancelAtPeriodEnd && !subscription.canceledAt) subscription.canceledAt = now;
      await subscription.save();

      const plan = (await getEffectivePlan(userId)).plan;
      if (plan !== previousPlan) events.emit("subscription.changed", { userId, plan, previousPlan, reason: "upgrade" });
      else if (subscription.cancelAtPeriodEnd && !wasCancelScheduled) {
        events.emit("subscription.changed", { userId, plan, previousPlan, reason: "cancel_scheduled" });
      }
      break;
    }

    case "subscription_ended": {
      if (!subscription) break;
      subscription.status = "expired";
      subscription.expiryDate = now;
      await subscription.save();
      events.emit("subscription.changed", { userId, plan: (await getEffectivePlan(userId)).plan, previousPlan, reason: "expired" });
      break;
    }

    case "ignored":
      break;
  }
}

/** Marks an event as processed, or reports that it was already handled. */
async function claimEvent(providerName: string, event: NormalizedBillingEvent): Promise<boolean> {
  try {
    await WebhookEvent.create({ provider: providerName, eventId: event.id, type: event.type });
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

export type WebhookOutcome = "applied" | "duplicate" | "ignored";

/**
 * Handles a provider webhook. Order matters: verify the signature first
 * (rejecting forgeries), then claim the event id (making redelivery a no-op),
 * then apply it — releasing the claim if applying fails, so the provider's
 * retry isn't wrongly treated as a duplicate.
 */
export async function handleWebhook(providerName: string, rawBody: Buffer, headers: IncomingHttpHeaders): Promise<WebhookOutcome> {
  const billing = getProviderByName(providerName);
  if (!billing) throw new ApiError(404, "Unknown payment provider");

  let event: NormalizedBillingEvent;
  try {
    event = await billing.parseWebhook(rawBody, headers);
  } catch (err) {
    webhooksTotal.inc({ provider: providerName, outcome: "rejected" });
    if (err instanceof WebhookVerificationError) throw new ApiError(400, err.message);
    throw err;
  }

  if (event.type === "ignored") {
    webhooksTotal.inc({ provider: providerName, outcome: "ignored" });
    return "ignored";
  }

  if (!(await claimEvent(providerName, event))) {
    webhooksTotal.inc({ provider: providerName, outcome: "duplicate" });
    return "duplicate";
  }

  try {
    await applyEvent(billing.name, event);
  } catch (err) {
    await WebhookEvent.deleteOne({ provider: providerName, eventId: event.id }).catch(() => undefined);
    webhooksTotal.inc({ provider: providerName, outcome: "error" });
    throw err;
  }

  webhooksTotal.inc({ provider: providerName, outcome: "applied" });
  return "applied";
}

// ---------------------------------------------------------------------------
// Sandbox checkout
// ---------------------------------------------------------------------------

/** Completes a mock checkout as if the provider had confirmed payment. */
export async function completeMockCheckout(userId: string, sessionToken: string) {
  if (env.PAYMENT_PROVIDER !== "mock" || env.NODE_ENV === "production") {
    throw new ApiError(404, "Not found");
  }
  await assertFeature("billing");

  const session = verifyMockSession(sessionToken);
  if (session.userId !== userId) throw ApiError.forbidden("This checkout session belongs to another account.");

  for (const event of buildMockCheckoutEvents(session, sessionToken)) {
    if (await claimEvent("mock", event)) await applyEvent("mock", event);
  }
  return getSubscriptionView(userId);
}

export type { PlanId };
