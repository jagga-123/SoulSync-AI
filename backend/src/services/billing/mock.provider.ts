import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { appUrl, env } from "../../config/env";
import { PLANS, isPaidPlan, priceFor, type BillingInterval, type PaidPlanId } from "../../features/plans";
import { ApiError } from "../../utils/ApiError";
import type { NormalizedBillingEvent, PaymentProvider } from "./types";
import { WebhookVerificationError } from "./types";

/**
 * Sandbox provider for development, demos and automated tests. It has no
 * network calls: "checkout" is a signed token the frontend's mock checkout page
 * sends back to `POST /api/billing/mock/complete`, which feeds the *same*
 * normalized events a real provider webhook would. Refused in production
 * (see config/env.ts), because it would hand out paid plans for free.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

interface MockSession {
  userId: string;
  plan: PaidPlanId;
  interval: BillingInterval;
  purpose: "mock-checkout";
}

const periodMs = (interval: BillingInterval) => (interval === "yearly" ? 365 : 30) * DAY_MS;

export function signMockSession(userId: string, plan: PaidPlanId, interval: BillingInterval): string {
  const payload: MockSession = { userId, plan, interval, purpose: "mock-checkout" };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "1h" });
}

export function verifyMockSession(token: string): MockSession {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as Partial<MockSession>;
    if (payload.purpose !== "mock-checkout" || !payload.userId || !payload.plan || !payload.interval || !isPaidPlan(payload.plan)) {
      throw new Error("bad payload");
    }
    return payload as MockSession;
  } catch {
    throw ApiError.badRequest("This checkout session is invalid or has expired.");
  }
}

/**
 * The events a real provider would send after a successful mock checkout.
 * Event and payment ids are derived from the session token, so completing the
 * same checkout twice (a double-click, a retried request) is a no-op — exactly
 * like a redelivered webhook — rather than a second charge.
 */
export function buildMockCheckoutEvents(session: MockSession, sessionToken: string): NormalizedBillingEvent[] {
  const providerSubscriptionId = `mock_sub_${session.userId}`;
  const periodEnd = new Date(Date.now() + periodMs(session.interval));
  const { amount, currency } = priceFor(session.plan, session.interval, "usd");
  const stamp = createHash("sha256").update(sessionToken).digest("hex").slice(0, 16);

  return [
    {
      id: `mock_evt_start_${session.userId}_${stamp}`,
      type: "subscription_started",
      userId: session.userId,
      plan: session.plan,
      interval: session.interval,
      providerSubscriptionId,
      providerCustomerId: `mock_cus_${session.userId}`,
      status: "active",
      periodEnd,
    },
    {
      id: `mock_evt_pay_${session.userId}_${stamp}`,
      type: "payment_succeeded",
      userId: session.userId,
      plan: session.plan,
      interval: session.interval,
      providerSubscriptionId,
      periodEnd,
      payment: { providerPaymentId: `mock_pay_${session.userId}_${stamp}`, amount, currency },
    },
  ];
}

export class MockProvider implements PaymentProvider {
  readonly name = "mock" as const;
  readonly currency = "usd" as const;

  async createCheckout(params: Parameters<PaymentProvider["createCheckout"]>[0]) {
    const sessionId = signMockSession(params.userId, params.plan, params.interval);
    return { url: `${appUrl}/billing/mock-checkout?session=${encodeURIComponent(sessionId)}`, sessionId };
  }

  async cancelAtPeriodEnd(): Promise<void> {
    // Nothing to tell a provider — the service records the scheduled cancellation.
  }

  async changePlan(_ref: unknown, plan: PaidPlanId, interval: BillingInterval) {
    const { amount, currency } = priceFor(plan, interval, "usd");
    return {
      periodEnd: new Date(Date.now() + periodMs(interval)),
      payment: { providerPaymentId: `mock_upgrade_${plan}_${Date.now()}`, amount, currency },
    };
  }

  async parseWebhook(): Promise<NormalizedBillingEvent> {
    throw new WebhookVerificationError("The mock provider has no webhooks.");
  }
}

export const MOCK_PLAN_NAMES = (plan: PaidPlanId) => PLANS[plan].name;
