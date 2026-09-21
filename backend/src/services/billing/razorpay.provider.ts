import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { env } from "../../config/env";
import { isPaidPlan, type BillingInterval, type PaidPlanId } from "../../features/plans";
import type { CheckoutParams, NormalizedBillingEvent, PaymentProvider, ProviderSubscriptionRef } from "./types";
import { WebhookVerificationError } from "./types";

// Razorpay is called over its REST API directly: it's a small surface (create /
// cancel / update a subscription), and using fetch keeps the base URL
// overridable so the whole flow can be exercised against a local test double.

function planMap(): Array<{ planId: string; plan: PaidPlanId; interval: BillingInterval }> {
  const entries: Array<[string | undefined, PaidPlanId, BillingInterval]> = [
    [env.RAZORPAY_PLAN_PREMIUM_MONTHLY, "premium", "monthly"],
    [env.RAZORPAY_PLAN_PREMIUM_YEARLY, "premium", "yearly"],
    [env.RAZORPAY_PLAN_PLUS_MONTHLY, "premium_plus", "monthly"],
    [env.RAZORPAY_PLAN_PLUS_YEARLY, "premium_plus", "yearly"],
  ];
  return entries.filter((e): e is [string, PaidPlanId, BillingInterval] => Boolean(e[0])).map(([planId, plan, interval]) => ({ planId, plan, interval }));
}

export function razorpayPlanIdFor(plan: PaidPlanId, interval: BillingInterval): string {
  const found = planMap().find((entry) => entry.plan === plan && entry.interval === interval);
  if (!found) throw new Error(`No Razorpay plan configured for ${plan}/${interval} (set RAZORPAY_PLAN_*).`);
  return found.planId;
}

/** Verifies `x-razorpay-signature`: hex HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyRazorpaySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const toDate = (unixSeconds: unknown): Date | undefined =>
  typeof unixSeconds === "number" ? new Date(unixSeconds * 1000) : undefined;

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  readonly currency = "inr" as const;

  private async request(method: string, path: string, body?: unknown): Promise<Loose> {
    const base = (env.RAZORPAY_BASE_URL ?? "https://api.razorpay.com").replace(/\/$/, "");
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await response.json().catch(() => ({}))) as Loose;
    if (!response.ok) {
      throw new Error(`Razorpay ${method} ${path} failed: HTTP ${response.status} ${json.error?.description ?? ""}`.trim());
    }
    return json;
  }

  async createCheckout(params: CheckoutParams) {
    const subscription = await this.request("POST", "/v1/subscriptions", {
      plan_id: razorpayPlanIdFor(params.plan, params.interval),
      // Razorpay requires a billing-cycle count; this is "effectively until cancelled".
      total_count: params.interval === "yearly" ? 10 : 120,
      quantity: 1,
      customer_notify: 1,
      notes: { userId: params.userId, plan: params.plan, interval: params.interval },
    });
    if (!subscription.short_url) throw new Error("Razorpay did not return a checkout URL");
    return { url: subscription.short_url as string, sessionId: subscription.id as string };
  }

  async cancelAtPeriodEnd(ref: ProviderSubscriptionRef): Promise<void> {
    await this.request("POST", `/v1/subscriptions/${encodeURIComponent(ref.providerSubscriptionId)}/cancel`, { cancel_at_cycle_end: 1 });
  }

  async changePlan(ref: ProviderSubscriptionRef, plan: PaidPlanId, interval: BillingInterval) {
    const updated = await this.request("PATCH", `/v1/subscriptions/${encodeURIComponent(ref.providerSubscriptionId)}`, {
      plan_id: razorpayPlanIdFor(plan, interval),
      schedule_change_at: "now",
      customer_notify: 1,
    });
    return { periodEnd: toDate(updated.current_end) };
  }

  async parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): Promise<NormalizedBillingEvent> {
    const signature = headers["x-razorpay-signature"];
    if (typeof signature !== "string") throw new WebhookVerificationError("Missing X-Razorpay-Signature header");
    if (!verifyRazorpaySignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET as string)) {
      throw new WebhookVerificationError("Invalid Razorpay signature");
    }

    let payload: Loose;
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as Loose;
    } catch {
      throw new WebhookVerificationError("Webhook body is not valid JSON");
    }

    const header = headers["x-razorpay-event-id"];
    const id = typeof header === "string" ? header : createHash("sha256").update(rawBody).digest("hex");

    const subscription: Loose = payload.payload?.subscription?.entity ?? {};
    const payment: Loose = payload.payload?.payment?.entity ?? {};
    const notes: Loose = subscription.notes ?? payment.notes ?? {};
    const byPlanId = planMap().find((entry) => entry.planId === subscription.plan_id);
    const plan: PaidPlanId | undefined = byPlanId?.plan ?? (typeof notes.plan === "string" && isPaidPlan(notes.plan) ? notes.plan : undefined);
    const interval: BillingInterval | undefined =
      byPlanId?.interval ?? (notes.interval === "monthly" || notes.interval === "yearly" ? notes.interval : undefined);

    const base = {
      id,
      userId: typeof notes.userId === "string" ? notes.userId : undefined,
      plan,
      interval,
      providerSubscriptionId: (subscription.id ?? payment.subscription_id) as string | undefined,
      providerCustomerId: subscription.customer_id as string | undefined,
    };

    switch (payload.event as string) {
      case "subscription.activated":
        return { ...base, type: "subscription_started", status: "active", periodEnd: toDate(subscription.current_end) };

      case "subscription.charged":
        return {
          ...base,
          type: "payment_succeeded",
          periodEnd: toDate(subscription.current_end),
          payment: {
            providerPaymentId: payment.id,
            amount: payment.amount ?? 0,
            currency: String(payment.currency ?? "INR").toLowerCase(),
            receiptUrl: undefined,
          },
        };

      case "payment.failed":
        return {
          ...base,
          type: "payment_failed",
          status: "past_due",
          payment: {
            providerPaymentId: payment.id,
            amount: payment.amount ?? 0,
            currency: String(payment.currency ?? "INR").toLowerCase(),
          },
        };

      case "subscription.pending":
      case "subscription.halted":
        return { ...base, type: "subscription_updated", status: "past_due" };

      case "subscription.updated":
        return { ...base, type: "subscription_updated", status: "active", periodEnd: toDate(subscription.current_end) };

      case "subscription.cancelled":
      case "subscription.completed":
        return { ...base, type: "subscription_ended" };

      default:
        return { id, type: "ignored" };
    }
  }
}
