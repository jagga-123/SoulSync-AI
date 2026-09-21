import type { IncomingHttpHeaders } from "node:http";
import type { BillingInterval, PaidPlanId } from "../../features/plans";
import type { PaymentProviderName } from "../../models/Subscription.model";

/**
 * What every payment provider's webhook is translated into. The billing
 * service only ever sees this shape, so Stripe, Razorpay and the sandbox all
 * drive exactly the same subscription/payment logic.
 */
export interface NormalizedBillingEvent {
  /** The provider's event id — the idempotency key. */
  id: string;
  type:
    | "subscription_started"
    | "payment_succeeded"
    | "payment_failed"
    | "subscription_updated"
    | "subscription_ended"
    | "ignored";
  userId?: string;
  plan?: PaidPlanId;
  interval?: BillingInterval;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  status?: "active" | "trialing" | "past_due" | "canceled";
  cancelAtPeriodEnd?: boolean;
  /** When paid access runs until. */
  periodEnd?: Date;
  payment?: {
    providerPaymentId: string;
    /** Minor units. */
    amount: number;
    currency: string;
    receiptUrl?: string;
  };
}

export interface CheckoutParams {
  userId: string;
  email: string;
  plan: PaidPlanId;
  interval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
  existingCustomerId?: string;
}

export interface ProviderSubscriptionRef {
  providerSubscriptionId: string;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** Currency this provider bills in. */
  readonly currency: "usd" | "inr";
  createCheckout(params: CheckoutParams): Promise<{ url: string; sessionId: string }>;
  /** Stops renewal at the end of the paid period; access continues until then. */
  cancelAtPeriodEnd(ref: ProviderSubscriptionRef): Promise<void>;
  changePlan(
    ref: ProviderSubscriptionRef,
    plan: PaidPlanId,
    interval: BillingInterval,
  ): Promise<{ periodEnd?: Date; payment?: NonNullable<NormalizedBillingEvent["payment"]> }>;
  /** Verifies the signature and translates the payload. Throws on a bad signature. */
  parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): Promise<NormalizedBillingEvent>;
}

/** Thrown for a webhook that can't be trusted (bad signature / unreadable). */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/** Thrown when an event can't be applied *yet* (e.g. it references a user we
 * haven't linked) — the webhook returns 5xx so the provider retries later. */
export class RetryableWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableWebhookError";
  }
}
