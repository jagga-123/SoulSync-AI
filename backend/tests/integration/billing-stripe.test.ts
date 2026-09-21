import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import Stripe from "stripe";
import { startFakeProvider, type FakeProvider } from "../helpers/fake-provider";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

const WEBHOOK_SECRET = "whsec_test_secret_for_tests";
const PRICES = {
  STRIPE_PRICE_PREMIUM_MONTHLY: "price_premium_monthly",
  STRIPE_PRICE_PREMIUM_YEARLY: "price_premium_yearly",
  STRIPE_PRICE_PLUS_MONTHLY: "price_plus_monthly",
  STRIPE_PRICE_PLUS_YEARLY: "price_plus_yearly",
};
const unix = (msFromNow: number) => Math.floor((Date.now() + msFromNow) / 1000);
const DAY = 86_400_000;

describe("billing (Stripe, against a local Stripe API double)", () => {
  let h: Harness;
  let stripeApi: FakeProvider;
  let admin: TestUser;
  const signer = new Stripe("sk_test_signer");
  let eventCounter = 0;

  before(async () => {
    // What Stripe would answer, closely enough for the official SDK to accept it.
    stripeApi = await startFakeProvider((req) => {
      if (req.method === "POST" && req.path === "/v1/checkout/sessions") {
        return { body: { id: "cs_test_1", object: "checkout.session", url: "https://checkout.stripe.test/c/pay/cs_test_1" } };
      }
      const sub = req.path.match(/^\/v1\/subscriptions\/(sub_[\w-]+)$/);
      if (sub?.[1]?.includes("does_not_exist")) {
        return { status: 404, body: { error: { type: "invalid_request_error", code: "resource_missing", message: "No such subscription" } } };
      }
      if (sub) {
        return {
          body: {
            id: sub[1], object: "subscription", status: "active",
            cancel_at_period_end: req.form.cancel_at_period_end === "true",
            items: { data: [{ id: "si_1", current_period_end: unix(30 * DAY), price: { id: req.form["items[0][price]"] ?? PRICES.STRIPE_PRICE_PREMIUM_MONTHLY } }] },
          },
        };
      }
      return undefined;
    });

    h = await startHarness({
      env: {
        PAYMENT_PROVIDER: "stripe",
        STRIPE_SECRET_KEY: "sk_test_fake_key",
        STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
        STRIPE_API_HOST: "127.0.0.1",
        STRIPE_API_PORT: String(stripeApi.port),
        STRIPE_API_PROTOCOL: "http",
        ...PRICES,
      },
    });
    admin = await h.makeAdmin(await h.createUser({ name: "Stripe Admin" }));
    await h.setFlag("billing", true);
  });

  after(async () => {
    await h.stop();
    await stripeApi.close();
  });

  /** Signs and posts a webhook exactly as Stripe would. */
  async function deliver(event: object, opts: { secret?: string; tamper?: boolean; noSignature?: boolean } = {}) {
    const payload = JSON.stringify(event);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!opts.noSignature) headers["Stripe-Signature"] = signer.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? WEBHOOK_SECRET });
    const res = await fetch(`${h.baseUrl}/api/billing/webhook/stripe`, { method: "POST", headers, body: opts.tamper ? payload.replace("premium", "premium_plus") : payload });
    return { status: res.status, body: (await res.json()) as { received?: boolean; outcome?: string } };
  }

  const evt = (type: string, object: object) => ({ id: `evt_${++eventCounter}_${type}`, object: "event", type, data: { object } });
  const meta = (user: TestUser, plan = "premium", interval = "monthly") => ({ userId: user.id, plan, interval });
  const checkoutCompleted = (user: TestUser, subId: string, plan = "premium") =>
    evt("checkout.session.completed", { id: "cs_test_1", mode: "subscription", client_reference_id: user.id, metadata: meta(user, plan), subscription: subId, customer: `cus_${subId}` });
  const invoicePaid = (user: TestUser, subId: string, amount = 999, id = `in_${++eventCounter}`) =>
    evt("invoice.paid", {
      id, subscription: subId, customer: `cus_${subId}`, amount_paid: amount, currency: "usd", hosted_invoice_url: `https://invoice.stripe.test/${id}`,
      subscription_details: { metadata: meta(user) }, lines: { data: [{ period: { end: unix(30 * DAY) } }] },
    });
  const overview = async (user: TestUser) => (await h.api.get("/billing/overview", { token: user.token })).body.data;

  it("reports Stripe as the provider, billing in USD", async () => {
    const { provider, currency, billingEnabled } = (await h.api.get("/billing/plans")).body.data;
    assert.deepEqual([provider, currency, billingEnabled], ["stripe", "usd", true]);
  });

  describe("checkout", () => {
    it("creates a hosted Checkout Session carrying the user, plan and price", async () => {
      const user = await h.createUser({ name: "Stripe Buyer", verified: true });
      const res = await h.api.post("/billing/checkout", { plan: "premium_plus", interval: "yearly" }, { token: user.token });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, { url: "https://checkout.stripe.test/c/pay/cs_test_1", provider: "stripe" });

      const [sent] = stripeApi.matching("POST", "/v1/checkout/sessions").slice(-1);
      assert.equal(sent!.form.mode, "subscription");
      assert.equal(sent!.form["line_items[0][price]"], "price_plus_yearly");
      assert.equal(sent!.form.client_reference_id, user.id);
      assert.equal(sent!.form.customer_email, user.email);
      assert.equal(sent!.form["metadata[plan]"], "premium_plus");
      assert.equal(sent!.form["subscription_data[metadata][userId]"], user.id);
      assert.match(String(sent!.headers.authorization), /^Bearer sk_test_fake_key$/);
      assert.match(sent!.form.success_url ?? "", /\/billing\?checkout=success$/);
      assert.equal((await overview(user)).subscription.plan, "free", "nothing is granted until Stripe confirms payment");
    });

    it("turns a Stripe API failure into a clean error, never a paid plan", async () => {
      const user = await h.createUser({ name: "Unlucky Ulla" });
      const { env } = await h.load("../../src/config/env");
      const original = env.STRIPE_PRICE_PREMIUM_MONTHLY;
      env.STRIPE_PRICE_PREMIUM_MONTHLY = undefined;
      try {
        const res = await h.api.post("/billing/checkout", { plan: "premium", interval: "monthly" }, { token: user.token });
        assert.equal(res.status, 500);
        assert.doesNotMatch(JSON.stringify(res.body), /sk_test/, "secrets never leak into errors");
      } finally {
        env.STRIPE_PRICE_PREMIUM_MONTHLY = original;
      }
      assert.equal((await overview(user)).subscription.plan, "free");
    });
  });

  describe("webhooks", () => {
    it("rejects unsigned, wrongly-signed and tampered webhooks — and applies nothing", async () => {
      const user = await h.createUser({ name: "Forgery Target" });
      const event = checkoutCompleted(user, "sub_forged", "premium_plus");

      assert.equal((await deliver(event, { noSignature: true })).status, 400);
      assert.equal((await deliver(event, { secret: "whsec_someone_elses" })).status, 400);
      assert.equal((await deliver(event, { tamper: true })).status, 400);
      assert.equal((await fetch(`${h.baseUrl}/api/billing/webhook/stripe`, { method: "POST", headers: { "Stripe-Signature": "t=1,v1=abc" }, body: "not json" })).status, 400);
      assert.equal((await overview(user)).subscription.plan, "free");
    });

    it("activates a subscription on checkout.session.completed, then records the invoice", async () => {
      const user = await h.createUser({ name: "Stripe Payer", verified: true });

      const started = await deliver(checkoutCompleted(user, "sub_pay_1"));
      assert.deepEqual(started, { status: 200, body: { received: true, outcome: "applied" } });
      const active = (await overview(user)).subscription;
      assert.equal(active.plan, "premium");
      assert.equal(active.provider, "stripe");
      assert.equal(active.status, "active");

      const paid = await deliver(invoicePaid(user, "sub_pay_1", 999, "in_pay_1"));
      assert.equal(paid.body.outcome, "applied");
      await h.settle();

      const { payments } = (await h.api.get("/billing/payments", { token: user.token })).body.data;
      assert.equal(payments.length, 1);
      assert.equal(payments[0].amount, 999);
      assert.equal(payments[0].providerPaymentId, "in_pay_1");
      assert.equal(payments[0].receiptUrl, "https://invoice.stripe.test/in_pay_1");
      assert.ok(Date.parse((await overview(user)).subscription.expiryDate) > Date.now() + 29 * DAY);
      assert.equal((await h.api.get("/notifications", { token: user.token })).body.data.notifications.filter((n: { title: string }) => /Welcome to Premium/.test(n.title)).length, 1);
    });

    it("treats a redelivered webhook as a no-op (no double payment, no second welcome)", async () => {
      const user = await h.createUser({ name: "Retry Rita" });
      const start = checkoutCompleted(user, "sub_dup");
      const invoice = invoicePaid(user, "sub_dup", 999, "in_dup");
      await deliver(start);
      await deliver(invoice);

      assert.equal((await deliver(start)).body.outcome, "duplicate");
      assert.equal((await deliver(invoice)).body.outcome, "duplicate");
      await h.settle();
      assert.equal((await h.api.get("/billing/payments", { token: user.token })).body.data.pagination.total, 1);
    });

    it("also de-duplicates by invoice, if Stripe sends a *different* event for the same invoice", async () => {
      const user = await h.createUser({ name: "Two Events Tia" });
      await deliver(checkoutCompleted(user, "sub_two"));
      await deliver(invoicePaid(user, "sub_two", 999, "in_same"));
      const second = await deliver({ ...invoicePaid(user, "sub_two", 999, "in_same"), id: "evt_other_delivery_of_same_invoice" });
      assert.equal(second.status, 200);
      assert.equal((await h.api.get("/billing/payments", { token: user.token })).body.data.pagination.total, 1);
    });

    it("asks Stripe to retry (503) when an invoice arrives before its checkout, then succeeds on the retry", async () => {
      const user = await h.createUser({ name: "Early Invoice Ida" });
      const invoice = evt("invoice.paid", {
        id: "in_early", subscription: "sub_early", customer: "cus_early", amount_paid: 999, currency: "usd",
        subscription_details: { metadata: {} }, lines: { data: [{ period: { end: unix(30 * DAY) } }] },
      });
      assert.equal((await deliver(invoice)).status, 503, "unknown subscription: come back later");

      await deliver(checkoutCompleted(user, "sub_early"));
      const retried = await deliver(invoice);
      assert.deepEqual(retried, { status: 200, body: { received: true, outcome: "applied" } });
      assert.equal((await h.api.get("/billing/payments", { token: user.token })).body.data.pagination.total, 1, "the earlier failure was released, not remembered as done");
    });

    it("acknowledges (200) events it doesn't care about, and non-subscription checkouts", async () => {
      assert.equal((await deliver(evt("customer.created", { id: "cus_x" }))).body.outcome, "ignored");
      const oneOff = evt("checkout.session.completed", { id: "cs_x", mode: "payment", client_reference_id: admin.id });
      assert.equal((await deliver(oneOff)).body.outcome, "ignored");
    });

    it("marks a subscription past due after a failed payment, keeps a failed record, and tells the user", async () => {
      const user = await h.createUser({ name: "Declined Dee" });
      await deliver(checkoutCompleted(user, "sub_fail"));
      const failed = evt("invoice.payment_failed", {
        id: "in_failed", subscription: "sub_fail", customer: "cus_sub_fail", amount_due: 999, currency: "usd",
        subscription_details: { metadata: meta(user) },
      });
      assert.equal((await deliver(failed)).body.outcome, "applied");
      await h.settle();

      assert.equal((await overview(user)).subscription.status, "past_due");
      const [payment] = (await h.api.get("/billing/payments", { token: user.token })).body.data.payments;
      assert.equal(payment.status, "failed");
      assert.ok((await h.api.get("/notifications", { token: user.token })).body.data.notifications.some((n: { title: string }) => n.title === "Payment failed"));
    });

    it("keeps access when a subscriber cancels in Stripe's portal, until the period ends", async () => {
      const user = await h.createUser({ name: "Portal Pete" });
      await deliver(checkoutCompleted(user, "sub_portal"));
      const updated = evt("customer.subscription.updated", {
        id: "sub_portal", customer: "cus_sub_portal", status: "active", cancel_at_period_end: true, metadata: { userId: user.id },
        items: { data: [{ price: { id: PRICES.STRIPE_PRICE_PREMIUM_MONTHLY }, current_period_end: unix(20 * DAY) }] },
      });
      assert.equal((await deliver(updated)).body.outcome, "applied");
      const sub = (await overview(user)).subscription;
      assert.equal(sub.cancelAtPeriodEnd, true);
      assert.equal(sub.plan, "premium");
      assert.ok(Math.abs(Date.parse(sub.expiryDate) - (Date.now() + 20 * DAY)) < 60_000, "period end follows Stripe's");

      const ended = evt("customer.subscription.deleted", { id: "sub_portal", metadata: { userId: user.id } });
      assert.equal((await deliver(ended)).body.outcome, "applied");
      await h.settle();
      assert.equal((await overview(user)).subscription.plan, "free");
      assert.ok((await h.api.get("/notifications", { token: user.token })).body.data.notifications.some((n: { title: string }) => n.title === "Your Premium has ended"));
    });

    it("finds the user by Stripe subscription id when metadata is absent", async () => {
      const user = await h.createUser({ name: "Lookup Lou" });
      await deliver(checkoutCompleted(user, "sub_lookup"));
      const noMetadata = evt("customer.subscription.deleted", { id: "sub_lookup" });
      assert.equal((await deliver(noMetadata)).body.outcome, "applied");
      assert.equal((await overview(user)).subscription.plan, "free");
    });
  });

  describe("managing a subscription through the API", () => {
    it("cancel tells Stripe to stop at period end", async () => {
      const user = await h.createUser({ name: "Api Canceller" });
      await deliver(checkoutCompleted(user, "sub_api_cancel"));
      const res = await h.api.post("/billing/cancel", undefined, { token: user.token });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.subscription.cancelAtPeriodEnd, true);

      const call = stripeApi.matching("POST", "/v1/subscriptions/sub_api_cancel").slice(-1)[0];
      assert.equal(call!.form.cancel_at_period_end, "true");
    });

    it("upgrade swaps the price on the existing subscription item, with proration", async () => {
      const user = await h.createUser({ name: "Api Upgrader" });
      await deliver(checkoutCompleted(user, "sub_api_up"));
      const res = await h.api.post("/billing/upgrade", { plan: "premium_plus" }, { token: user.token });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.subscription.plan, "premium_plus");

      const call = stripeApi.matching("POST", "/v1/subscriptions/sub_api_up").slice(-1)[0];
      assert.equal(call!.form["items[0][id]"], "si_1");
      assert.equal(call!.form["items[0][price]"], "price_plus_monthly");
      assert.equal(call!.form.proration_behavior, "create_prorations");
    });

    it("a Stripe outage on cancel surfaces as an error and changes nothing", async () => {
      const user = await h.createUser({ name: "Outage Olga" });
      await deliver(checkoutCompleted(user, "sub_outage"));
      const { Subscription } = await h.load("../../src/models/Subscription.model");
      await Subscription.updateOne({ userId: user.id, source: "paid" }, { $set: { providerSubscriptionId: "sub_does_not_exist_upstream" } });

      const res = await h.api.post("/billing/cancel", undefined, { token: user.token });
      assert.ok(res.status >= 400);
      assert.equal((await overview(user)).subscription.cancelAtPeriodEnd, false, "the local state isn't marked cancelled if Stripe refused");
    });
  });

  it("exposes no sandbox completion route in this configuration", async () => {
    const user = await h.createUser({ name: "Sandbox Sam" });
    const res = await h.api.post("/billing/mock/complete", { session: "x".repeat(40) }, { token: user.token });
    assert.equal(res.status, 404);
  });
});
