import type { IncomingHttpHeaders } from "node:http";
import type Stripe from "stripe";
import { env } from "../../config/env";
import { isPaidPlan, type BillingInterval, type PaidPlanId } from "../../features/plans";
import type { CheckoutParams, NormalizedBillingEvent, PaymentProvider, ProviderSubscriptionRef } from "./types";
import { WebhookVerificationError } from "./types";

type StripeClient = Stripe;

/** price id <-> (plan, interval), from environment configuration. */
function priceMap(): Array<{ priceId: string; plan: PaidPlanId; interval: BillingInterval }> {
  const entries: Array<[string | undefined, PaidPlanId, BillingInterval]> = [
    [env.STRIPE_PRICE_PREMIUM_MONTHLY, "premium", "monthly"],
    [env.STRIPE_PRICE_PREMIUM_YEARLY, "premium", "yearly"],
    [env.STRIPE_PRICE_PLUS_MONTHLY, "premium_plus", "monthly"],
    [env.STRIPE_PRICE_PLUS_YEARLY, "premium_plus", "yearly"],
  ];
  return entries.filter((e): e is [string, PaidPlanId, BillingInterval] => Boolean(e[0])).map(([priceId, plan, interval]) => ({ priceId, plan, interval }));
}

export function stripePriceFor(plan: PaidPlanId, interval: BillingInterval): string {
  const found = priceMap().find((entry) => entry.plan === plan && entry.interval === interval);
  if (!found) throw new Error(`No Stripe price configured for ${plan}/${interval} (set STRIPE_PRICE_*).`);
  return found.priceId;
}

const toDate = (unixSeconds: unknown): Date | undefined =>
  typeof unixSeconds === "number" ? new Date(unixSeconds * 1000) : undefined;

// Stripe's payloads are read loosely on purpose: field locations moved between
// API versions (e.g. `current_period_end` from the subscription to its items),
// and we only need a handful of them.
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function subscriptionPeriodEnd(subscription: Loose): Date | undefined {
  return toDate(subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end);
}

function invoiceSubscriptionId(invoice: Loose): string | undefined {
  const direct = invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
  return typeof direct === "string" ? direct : direct?.id;
}

function invoiceMetadata(invoice: Loose): Loose {
  return invoice.subscription_details?.metadata ?? invoice.parent?.subscription_details?.metadata ?? invoice.lines?.data?.[0]?.metadata ?? {};
}

function planFromMetadata(metadata: Loose | undefined): { plan?: PaidPlanId; interval?: BillingInterval } {
  const plan = metadata?.plan;
  const interval = metadata?.interval;
  return {
    plan: typeof plan === "string" && isPaidPlan(plan) ? plan : undefined,
    interval: interval === "monthly" || interval === "yearly" ? interval : undefined,
  };
}

export class StripeProvider implements PaymentProvider {
  readonly name = "stripe" as const;
  readonly currency = "usd" as const;
  private client: Promise<StripeClient> | undefined;

  private getClient(): Promise<StripeClient> {
    this.client ??= import("stripe").then(({ default: Stripe }) =>
      new Stripe(env.STRIPE_SECRET_KEY as string, {
        maxNetworkRetries: 1,
        timeout: 15_000,
        ...(env.STRIPE_API_HOST
          ? { host: env.STRIPE_API_HOST, port: env.STRIPE_API_PORT, protocol: env.STRIPE_API_PROTOCOL ?? "https" }
          : {}),
      }),
    );
    return this.client;
  }

  async createCheckout(params: CheckoutParams) {
    const stripe = await this.getClient();
    const metadata = { userId: params.userId, plan: params.plan, interval: params.interval };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: stripePriceFor(params.plan, params.interval), quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.userId,
      ...(params.existingCustomerId ? { customer: params.existingCustomerId } : { customer_email: params.email }),
      metadata,
      subscription_data: { metadata },
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url, sessionId: session.id };
  }

  async cancelAtPeriodEnd(ref: ProviderSubscriptionRef): Promise<void> {
    const stripe = await this.getClient();
    await stripe.subscriptions.update(ref.providerSubscriptionId, { cancel_at_period_end: true });
  }

  async changePlan(ref: ProviderSubscriptionRef, plan: PaidPlanId, interval: BillingInterval) {
    const stripe = await this.getClient();
    const subscription = (await stripe.subscriptions.retrieve(ref.providerSubscriptionId)) as unknown as Loose;
    const itemId = subscription.items?.data?.[0]?.id as string | undefined;
    if (!itemId) throw new Error("Stripe subscription has no items to change");

    const updated = (await stripe.subscriptions.update(ref.providerSubscriptionId, {
      items: [{ id: itemId, price: stripePriceFor(plan, interval) }],
      proration_behavior: "create_prorations",
      metadata: { plan, interval },
    })) as unknown as Loose;
    return { periodEnd: subscriptionPeriodEnd(updated) };
  }

  async parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): Promise<NormalizedBillingEvent> {
    const signature = headers["stripe-signature"];
    if (typeof signature !== "string") throw new WebhookVerificationError("Missing Stripe-Signature header");

    const stripe = await this.getClient();
    let event: Loose;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET as string) as unknown as Loose;
    } catch (err) {
      throw new WebhookVerificationError(err instanceof Error ? err.message : "Invalid Stripe signature");
    }

    const object: Loose = event.data?.object ?? {};

    switch (event.type as string) {
      case "checkout.session.completed": {
        if (object.mode !== "subscription") return { id: event.id, type: "ignored" };
        const { plan, interval } = planFromMetadata(object.metadata);
        return {
          id: event.id,
          type: "subscription_started",
          userId: object.client_reference_id ?? object.metadata?.userId,
          plan,
          interval,
          providerSubscriptionId: typeof object.subscription === "string" ? object.subscription : object.subscription?.id,
          providerCustomerId: typeof object.customer === "string" ? object.customer : object.customer?.id,
          status: "active",
        };
      }

      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const { plan, interval } = planFromMetadata(invoiceMetadata(object));
        return {
          id: event.id,
          type: "payment_succeeded",
          userId: invoiceMetadata(object).userId,
          plan,
          interval,
          providerSubscriptionId: invoiceSubscriptionId(object),
          providerCustomerId: typeof object.customer === "string" ? object.customer : undefined,
          periodEnd: toDate(object.lines?.data?.[0]?.period?.end),
          payment: {
            providerPaymentId: object.id,
            amount: object.amount_paid ?? 0,
            currency: object.currency ?? "usd",
            receiptUrl: object.hosted_invoice_url ?? undefined,
          },
        };
      }

      case "invoice.payment_failed":
        return {
          id: event.id,
          type: "payment_failed",
          userId: invoiceMetadata(object).userId,
          providerSubscriptionId: invoiceSubscriptionId(object),
          status: "past_due",
          payment: {
            providerPaymentId: object.id,
            amount: object.amount_due ?? 0,
            currency: object.currency ?? "usd",
            receiptUrl: object.hosted_invoice_url ?? undefined,
          },
        };

      case "customer.subscription.updated": {
        const priceId = object.items?.data?.[0]?.price?.id as string | undefined;
        const fromPrice = priceMap().find((entry) => entry.priceId === priceId);
        const fromMeta = planFromMetadata(object.metadata);
        return {
          id: event.id,
          type: "subscription_updated",
          userId: object.metadata?.userId,
          plan: fromPrice?.plan ?? fromMeta.plan,
          interval: fromPrice?.interval ?? fromMeta.interval,
          providerSubscriptionId: object.id,
          providerCustomerId: typeof object.customer === "string" ? object.customer : undefined,
          status: object.status === "past_due" || object.status === "unpaid" ? "past_due" : object.status === "canceled" ? "canceled" : "active",
          cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
          periodEnd: subscriptionPeriodEnd(object),
        };
      }

      case "customer.subscription.deleted":
        return {
          id: event.id,
          type: "subscription_ended",
          userId: object.metadata?.userId,
          providerSubscriptionId: object.id,
        };

      default:
        return { id: event.id, type: "ignored" };
    }
  }
}
