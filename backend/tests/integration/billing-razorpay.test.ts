import "../helpers/setup-env";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startFakeProvider, type FakeProvider } from "../helpers/fake-provider";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

const WEBHOOK_SECRET = "rzp_webhook_secret_for_tests";
const KEY_ID = "rzp_test_keyid";
const KEY_SECRET = "rzp_test_keysecret";
const PLANS = {
  RAZORPAY_PLAN_PREMIUM_MONTHLY: "plan_premium_m",
  RAZORPAY_PLAN_PREMIUM_YEARLY: "plan_premium_y",
  RAZORPAY_PLAN_PLUS_MONTHLY: "plan_plus_m",
  RAZORPAY_PLAN_PLUS_YEARLY: "plan_plus_y",
};
const DAY = 86_400_000;
const unix = (msFromNow: number) => Math.floor((Date.now() + msFromNow) / 1000);

describe("billing (Razorpay, against a local Razorpay API double)", () => {
  let h: Harness;
  let api: FakeProvider;
  let eventCounter = 0;

  before(async () => {
    api = await startFakeProvider((req) => {
      if (req.method === "POST" && req.path === "/v1/subscriptions") {
        return { body: { id: "sub_rzp_created", entity: "subscription", short_url: "https://rzp.io/i/abc123", status: "created" } };
      }
      const sub = req.path.match(/^\/v1\/subscriptions\/([\w-]+)(\/cancel)?$/);
      if (sub?.[1]?.includes("does_not_exist")) return { status: 400, body: { error: { description: "The id provided does not exist" } } };
      if (sub && req.method === "POST" && sub[2]) return { body: { id: sub[1], status: "cancelled" } };
      if (sub && req.method === "PATCH") return { body: { id: sub[1], plan_id: req.json?.plan_id, current_end: unix(30 * DAY) } };
      return undefined;
    });

    h = await startHarness({
      env: {
        PAYMENT_PROVIDER: "razorpay",
        RAZORPAY_KEY_ID: KEY_ID,
        RAZORPAY_KEY_SECRET: KEY_SECRET,
        RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
        RAZORPAY_BASE_URL: api.url,
        ...PLANS,
      },
    });
    await h.setFlag("billing", true);
  });

  after(async () => {
    await h.stop();
    await api.close();
  });

  const sign = (body: string, secret = WEBHOOK_SECRET) => createHmac("sha256", secret).update(body).digest("hex");

  async function deliver(payload: object, opts: { eventId?: string; secret?: string; signature?: string | null } = {}) {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-Razorpay-Event-Id": opts.eventId ?? `rzp_evt_${++eventCounter}` };
    if (opts.signature !== null) headers["X-Razorpay-Signature"] = opts.signature ?? sign(body, opts.secret);
    const res = await fetch(`${h.baseUrl}/api/billing/webhook/razorpay`, { method: "POST", headers, body });
    return { status: res.status, body: (await res.json()) as { outcome?: string } };
  }

  const subscriptionEntity = (user: TestUser, subId: string, planId = PLANS.RAZORPAY_PLAN_PREMIUM_MONTHLY, currentEnd = unix(30 * DAY)) => ({
    id: subId, plan_id: planId, customer_id: `cust_${subId}`, current_end: currentEnd, notes: { userId: user.id },
  });
  const activated = (user: TestUser, subId: string, planId?: string) => ({ event: "subscription.activated", payload: { subscription: { entity: subscriptionEntity(user, subId, planId) } } });
  const charged = (user: TestUser, subId: string, paymentId: string, amount = 79900) => ({
    event: "subscription.charged",
    payload: { subscription: { entity: subscriptionEntity(user, subId) }, payment: { entity: { id: paymentId, amount, currency: "INR", subscription_id: subId } } },
  });
  const overview = async (user: TestUser) => (await h.api.get("/billing/overview", { token: user.token })).body.data;

  it("bills in INR at the rupee prices", async () => {
    const { provider, currency, plans } = (await h.api.get("/billing/plans")).body.data;
    assert.deepEqual([provider, currency], ["razorpay", "inr"]);
    assert.deepEqual(plans[1].prices, { monthly: 79900, yearly: 799000 });
  });

  it("creates a Razorpay subscription for checkout, authenticated and tagged with the user", async () => {
    const user = await h.createUser({ name: "Rzp Buyer" });
    const res = await h.api.post("/billing/checkout", { plan: "premium", interval: "monthly" }, { token: user.token });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data, { url: "https://rzp.io/i/abc123", provider: "razorpay" });

    const call = api.matching("POST", "/v1/subscriptions").slice(-1)[0]!;
    assert.equal(call.json.plan_id, "plan_premium_m");
    assert.deepEqual(call.json.notes, { userId: user.id, plan: "premium", interval: "monthly" });
    assert.equal(call.headers.authorization, `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64")}`);
    assert.equal((await overview(user)).subscription.plan, "free");
  });

  it("rejects webhooks with a missing, wrong or forged signature", async () => {
    const user = await h.createUser({ name: "Rzp Forgery" });
    const event = activated(user, "sub_rzp_forged", PLANS.RAZORPAY_PLAN_PLUS_MONTHLY);
    assert.equal((await deliver(event, { signature: null })).status, 400);
    assert.equal((await deliver(event, { signature: "0".repeat(64) })).status, 400);
    assert.equal((await deliver(event, { secret: "another-secret" })).status, 400);
    assert.equal((await deliver(event, { signature: "short" })).status, 400);

    // A valid signature over a *different* body must not authenticate this one:
    // sign a Premium activation, then swap the plan id to Premium Plus.
    const signedBody = JSON.stringify(activated(user, "sub_rzp_forged_body", PLANS.RAZORPAY_PLAN_PREMIUM_MONTHLY));
    const forgedBody = signedBody.replace(PLANS.RAZORPAY_PLAN_PREMIUM_MONTHLY, PLANS.RAZORPAY_PLAN_PLUS_MONTHLY);
    assert.notEqual(signedBody, forgedBody);
    const res = await fetch(`${h.baseUrl}/api/billing/webhook/razorpay`, {
      method: "POST", headers: { "X-Razorpay-Signature": sign(signedBody), "X-Razorpay-Event-Id": "rzp_forged_body" }, body: forgedBody,
    });
    assert.equal(res.status, 400);
    assert.equal((await overview(user)).subscription.plan, "free");
  });

  it("activates the plan named by the Razorpay plan id, then records each charge once", async () => {
    const user = await h.createUser({ name: "Rzp Payer" });
    const start = await deliver(activated(user, "sub_rzp_1", PLANS.RAZORPAY_PLAN_PLUS_MONTHLY));
    assert.equal(start.body.outcome, "applied");
    assert.equal((await overview(user)).subscription.plan, "premium_plus", "plan comes from the plan id, not client input");

    const charge = charged(user, "sub_rzp_1", "pay_rzp_1", 159900);
    assert.equal((await deliver(charge, { eventId: "rzp_charge_1" })).body.outcome, "applied");
    assert.equal((await deliver(charge, { eventId: "rzp_charge_1" })).body.outcome, "duplicate");
    assert.equal((await deliver(charge, { eventId: "rzp_charge_1_redelivered_as_new" })).status, 200);

    const { payments, pagination } = (await h.api.get("/billing/payments", { token: user.token })).body.data;
    assert.equal(pagination.total, 1);
    assert.equal(payments[0].amount, 159900);
    assert.equal(payments[0].currency, "inr");
    assert.equal(payments[0].provider, "razorpay");
  });

  it("falls back to a body hash as the idempotency key when no event-id header is sent", async () => {
    const user = await h.createUser({ name: "Rzp NoHeader" });
    const body = JSON.stringify(activated(user, "sub_rzp_nohdr"));
    const post = () => fetch(`${h.baseUrl}/api/billing/webhook/razorpay`, { method: "POST", headers: { "X-Razorpay-Signature": sign(body) }, body }).then((r) => r.json() as Promise<{ outcome: string }>);
    assert.equal((await post()).outcome, "applied");
    assert.equal((await post()).outcome, "duplicate");
  });

  it("asks Razorpay to retry when a charge arrives before the subscription is known", async () => {
    const user = await h.createUser({ name: "Rzp Early" });
    const earlyCharge = { event: "subscription.charged", payload: { subscription: { entity: { id: "sub_rzp_early", plan_id: PLANS.RAZORPAY_PLAN_PREMIUM_MONTHLY, current_end: unix(30 * DAY) } }, payment: { entity: { id: "pay_early", amount: 79900, currency: "INR" } } } };
    assert.equal((await deliver(earlyCharge, { eventId: "rzp_early_charge" })).status, 503);

    await deliver(activated(user, "sub_rzp_early"));
    assert.equal((await deliver(earlyCharge, { eventId: "rzp_early_charge" })).body.outcome, "applied");
  });

  it("handles failed payments, and the end of a subscription", async () => {
    const user = await h.createUser({ name: "Rzp Lapsing" });
    await deliver(activated(user, "sub_rzp_lapse"));
    await deliver({ event: "payment.failed", payload: { subscription: { entity: subscriptionEntity(user, "sub_rzp_lapse") }, payment: { entity: { id: "pay_failed_1", amount: 79900, currency: "INR", subscription_id: "sub_rzp_lapse" } } } });
    assert.equal((await overview(user)).subscription.status, "past_due");

    await deliver({ event: "subscription.cancelled", payload: { subscription: { entity: subscriptionEntity(user, "sub_rzp_lapse") } } });
    assert.equal((await overview(user)).subscription.plan, "free");
  });

  it("acknowledges events it doesn't act on", async () => {
    const res = await deliver({ event: "order.paid", payload: {} });
    assert.equal(res.body.outcome, "ignored");
  });

  it("cancel goes to Razorpay with cancel_at_cycle_end; upgrade patches the plan", async () => {
    const user = await h.createUser({ name: "Rzp Manager" });
    await deliver(activated(user, "sub_rzp_manage"));

    const upgraded = await h.api.post("/billing/upgrade", { plan: "premium_plus" }, { token: user.token });
    assert.equal(upgraded.status, 200, JSON.stringify(upgraded.body));
    assert.equal(upgraded.body.data.subscription.plan, "premium_plus");
    const patch = api.matching("PATCH", "/v1/subscriptions/sub_rzp_manage").slice(-1)[0]!;
    assert.equal(patch.json.plan_id, "plan_plus_m");
    assert.equal(patch.json.schedule_change_at, "now");

    const cancelled = await h.api.post("/billing/cancel", undefined, { token: user.token });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data.subscription.cancelAtPeriodEnd, true);
    assert.equal(api.matching("POST", "/v1/subscriptions/sub_rzp_manage/cancel").slice(-1)[0]!.json.cancel_at_cycle_end, 1);
  });

  it("does nothing locally when Razorpay refuses the cancellation", async () => {
    const user = await h.createUser({ name: "Rzp Refused" });
    await deliver(activated(user, "sub_rzp_refused"));
    const { Subscription } = await h.load("../../src/models/Subscription.model");
    await Subscription.updateOne({ userId: user.id, source: "paid" }, { $set: { providerSubscriptionId: "sub_does_not_exist" } });

    const res = await h.api.post("/billing/cancel", undefined, { token: user.token });
    assert.ok(res.status >= 400);
    assert.equal((await overview(user)).subscription.cancelAtPeriodEnd, false);
  });
});
