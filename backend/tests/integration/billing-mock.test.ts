import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

describe("billing (sandbox provider)", () => {
  let h: Harness;
  let admin: TestUser;

  before(async () => {
    h = await startHarness();
    admin = await h.makeAdmin(await h.createUser({ name: "Billing Admin" }));
  });
  after(() => h.stop());

  const sessionOf = (url: string) => new URL(url).searchParams.get("session") as string;
  const overview = async (user: TestUser) => (await h.api.get("/billing/overview", { token: user.token })).body.data;

  /** Runs a full sandbox checkout for `user`. */
  async function subscribe(user: TestUser, plan = "premium", interval = "monthly") {
    const started = await h.api.post("/billing/checkout", { plan, interval }, { token: user.token });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    const done = await h.api.post("/billing/mock/complete", { session: sessionOf(started.body.data.url) }, { token: user.token });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    await h.settle();
    return done.body.data.subscription;
  }

  describe("catalog", () => {
    it("lists all three plans publicly, with prices and which perks are live", async () => {
      const res = await h.api.get("/billing/plans");
      assert.equal(res.status, 200);
      const { plans, currency, provider, billingEnabled } = res.body.data;
      assert.deepEqual(plans.map((p: { id: string }) => p.id), ["free", "premium", "premium_plus"]);
      assert.equal(currency, "usd");
      assert.equal(provider, "mock");
      assert.equal(billingEnabled, false, "billing ships switched off");
      assert.deepEqual(plans[1].prices, { monthly: 999, yearly: 9900 });
      assert.equal(plans[2].limits.monthlyBoosts, 4);
      assert.equal(plans[0].limits.dailyLikes, 20);
      assert.equal(plans[1].limits.dailyLikes, null, "unlimited is null, not Infinity");
      assert.ok(plans[1].perks.every((perk: { live: boolean }) => perk.live === false), "no perk is live until enabled");
      assert.ok(plans[2].perks.some((perk: { key: string }) => perk.key === "ai_deep_analysis"));
    });

    it("keeps checkout closed while the billing flag is off", async () => {
      const user = await h.createUser({ name: "Early Bird" });
      const res = await h.api.post("/billing/checkout", { plan: "premium" }, { token: user.token });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, "FEATURE_DISABLED");
      assert.equal((await overview(user)).subscription.plan, "free");
    });
  });

  describe("subscribing", () => {
    before(async () => {
      await h.setFlag("billing", true);
    });

    it("requires a login and a valid plan", async () => {
      assert.equal((await h.api.post("/billing/checkout", { plan: "premium" })).status, 401);
      const user = await h.createUser({ name: "Picky Pat" });
      assert.equal((await h.api.post("/billing/checkout", { plan: "free" }, { token: user.token })).status, 422);
      assert.equal((await h.api.post("/billing/checkout", { plan: "platinum" }, { token: user.token })).status, 422);
      assert.equal((await h.api.post("/billing/checkout", { plan: "premium", interval: "weekly" }, { token: user.token })).status, 422);
    });

    it("completes a checkout: subscription, payment record, in-app notification and confirmation email", async () => {
      const user = await h.createUser({ name: "Payer Pia", verified: true });
      const before = await overview(user);
      assert.equal(before.billingEnabled, true);
      assert.equal(before.subscription.plan, "free");

      const sub = await subscribe(user, "premium", "monthly");
      assert.equal(sub.plan, "premium");
      assert.equal(sub.status, "active");
      assert.equal(sub.source, "paid");
      assert.equal(sub.billingInterval, "monthly");
      assert.equal(sub.cancelAtPeriodEnd, false);
      const days = (Date.parse(sub.expiryDate) - Date.now()) / 86_400_000;
      assert.ok(days > 29 && days <= 30.1, `expected ~30 days, got ${days}`);

      const payments = await h.api.get("/billing/payments", { token: user.token });
      assert.equal(payments.body.data.pagination.total, 1);
      const [payment] = payments.body.data.payments;
      assert.equal(payment.amount, 999);
      assert.equal(payment.currency, "usd");
      assert.equal(payment.status, "succeeded");
      assert.equal(payment.plan, "premium");
      assert.equal(payment.description, "Premium (monthly)");

      const { notifications } = (await h.api.get("/notifications", { token: user.token })).body.data;
      assert.ok(notifications.some((n: { type: string; title: string }) => n.type === "subscription" && /Welcome to Premium/.test(n.title)));
      assert.ok(h.outbox.some((m) => m.to === user.email && /premium/i.test(m.subject)), "confirmation email");

      assert.equal((await h.api.get("/features", { token: user.token })).body.data.plan, "premium");
    });

    it("bills yearly plans at the yearly price", async () => {
      const user = await h.createUser({ name: "Yearly Yan" });
      const sub = await subscribe(user, "premium_plus", "yearly");
      assert.equal(sub.plan, "premium_plus");
      assert.ok((Date.parse(sub.expiryDate) - Date.now()) / 86_400_000 > 364);
      const [payment] = (await h.api.get("/billing/payments", { token: user.token })).body.data.payments;
      assert.equal(payment.amount, 19900);
    });

    it("won't let a checkout session be used by someone else, forged, or twice for double credit", async () => {
      const [owner, thief] = [await h.createUser({ name: "Session Owner" }), await h.createUser({ name: "Session Thief" })];
      const started = await h.api.post("/billing/checkout", { plan: "premium" }, { token: owner.token });
      const session = sessionOf(started.body.data.url);

      assert.equal((await h.api.post("/billing/mock/complete", { session }, { token: thief.token })).status, 403);
      assert.equal((await h.api.post("/billing/mock/complete", { session: "not.a.real-session-token" }, { token: owner.token })).status, 400);
      assert.equal((await overview(thief)).subscription.plan, "free");

      assert.equal((await h.api.post("/billing/mock/complete", { session }, { token: owner.token })).status, 200);
      const again = await h.api.post("/billing/mock/complete", { session }, { token: owner.token });
      assert.equal(again.status, 200, "an accidental double-click is harmless");
      assert.equal((await h.api.get("/billing/payments", { token: owner.token })).body.data.pagination.total, 1);
    });

    it("refuses to start a second checkout while subscribed, pointing to upgrade for higher plans", async () => {
      const user = await h.createUser({ name: "Double Dee" });
      await subscribe(user, "premium");
      const same = await h.api.post("/billing/checkout", { plan: "premium" }, { token: user.token });
      assert.equal(same.status, 409);
      assert.equal(same.body.error.code, "ALREADY_SUBSCRIBED");
      const higher = await h.api.post("/billing/checkout", { plan: "premium_plus" }, { token: user.token });
      assert.equal(higher.status, 409);
      assert.equal(higher.body.error.code, "USE_UPGRADE");
    });
  });

  describe("upgrading", () => {
    let user: TestUser;

    before(async () => {
      user = await h.createUser({ name: "Upgrader Uma" });
    });

    it("needs an active subscription first", async () => {
      assert.equal((await h.api.post("/billing/upgrade", { plan: "premium_plus" }, { token: user.token })).status, 409);
    });

    it("moves Premium to Premium Plus, recording the new charge", async () => {
      await subscribe(user, "premium");
      const upgraded = await h.api.post("/billing/upgrade", { plan: "premium_plus" }, { token: user.token });
      assert.equal(upgraded.status, 200);
      assert.equal(upgraded.body.data.subscription.plan, "premium_plus");
      assert.equal((await h.api.get("/billing/payments", { token: user.token })).body.data.pagination.total, 2);
      assert.equal((await h.api.get("/features", { token: user.token })).body.data.plan, "premium_plus");
    });

    it("rejects sideways and downward moves", async () => {
      assert.equal((await h.api.post("/billing/upgrade", { plan: "premium_plus" }, { token: user.token })).status, 400);
      assert.equal((await h.api.post("/billing/upgrade", { plan: "premium" }, { token: user.token })).status, 400);
      assert.equal((await h.api.post("/billing/upgrade", { plan: "free" }, { token: user.token })).status, 422);
    });

    it("blocks an upgrade once cancellation is scheduled", async () => {
      const other = await h.createUser({ name: "Cancel Then Upgrade" });
      await subscribe(other, "premium");
      await h.api.post("/billing/cancel", undefined, { token: other.token });
      assert.equal((await h.api.post("/billing/upgrade", { plan: "premium_plus" }, { token: other.token })).status, 409);
    });
  });

  describe("cancelling", () => {
    it("keeps access until the period ends, and is idempotent", async () => {
      const user = await h.createUser({ name: "Canceller Cy" });
      assert.equal((await h.api.post("/billing/cancel", undefined, { token: user.token })).status, 409, "nothing to cancel");

      await subscribe(user, "premium");
      const cancelled = await h.api.post("/billing/cancel", undefined, { token: user.token });
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.body.data.subscription.cancelAtPeriodEnd, true);
      assert.equal(cancelled.body.data.subscription.plan, "premium", "still Premium until the end");
      assert.equal((await h.api.get("/features", { token: user.token })).body.data.plan, "premium");
      assert.equal((await h.api.post("/billing/cancel", undefined, { token: user.token })).status, 200);

      await h.settle();
      const { notifications } = (await h.api.get("/notifications", { token: user.token })).body.data;
      assert.equal(notifications.filter((n: { title: string }) => n.title === "Your subscription will end").length, 1, "one notification, not two");
    });

    it("drops to Free after the paid period runs out (expiry job), and tells the user", async () => {
      const user = await h.createUser({ name: "Expiring Ed" });
      await subscribe(user, "premium");
      await h.api.post("/billing/cancel", undefined, { token: user.token });

      const { Subscription } = await h.load("../../src/models/Subscription.model");
      await Subscription.updateOne({ userId: user.id, source: "paid" }, { $set: { expiryDate: new Date(Date.now() - 60_000) } });
      assert.equal((await h.api.get("/features", { token: user.token })).body.data.plan, "free", "an elapsed period grants nothing, even before the job runs");

      const job = await h.api.post("/admin/jobs/subscription-expiry/run?force=true", undefined, { token: admin.token });
      assert.equal(job.status, 200, JSON.stringify(job.body));
      await h.settle();

      assert.equal((await Subscription.findOne({ userId: user.id, source: "paid" })).status, "expired");
      const { notifications } = (await h.api.get("/notifications", { token: user.token })).body.data;
      assert.ok(notifications.some((n: { title: string }) => n.title === "Your Premium has ended"));
      assert.equal((await overview(user)).subscription.plan, "free");
    });

    it("lets a former subscriber start again", async () => {
      const user = await h.createUser({ name: "Returning Rae" });
      await subscribe(user, "premium");
      const { Subscription } = await h.load("../../src/models/Subscription.model");
      await Subscription.updateOne({ userId: user.id, source: "paid" }, { $set: { status: "expired", expiryDate: new Date(Date.now() - 1000) } });

      assert.equal((await subscribe(user, "premium_plus")).plan, "premium_plus");
      assert.equal(await Subscription.countDocuments({ userId: user.id, source: "paid" }), 1, "one paid subscription per user, reused");
    });
  });

  describe("payment history", () => {
    it("is private, newest first and paginated", async () => {
      const user = await h.createUser({ name: "History Hal" });
      const stranger = await h.createUser({ name: "Nosy Nan" });
      await subscribe(user, "premium");
      await h.api.post("/billing/upgrade", { plan: "premium_plus" }, { token: user.token });

      const page = await h.api.get("/billing/payments?limit=1", { token: user.token });
      assert.equal(page.body.data.payments.length, 1);
      assert.equal(page.body.data.pagination.total, 2);
      assert.equal(page.body.data.pagination.totalPages, 2);
      assert.equal(page.body.data.payments[0].plan, "premium_plus", "newest first");
      assert.equal((await h.api.get("/billing/payments", { token: stranger.token })).body.data.payments.length, 0);
      assert.equal((await h.api.get("/billing/payments")).status, 401);
      assert.equal((await h.api.get("/billing/payments?limit=1000", { token: user.token })).status, 422);
    });
  });

  describe("complimentary plans", () => {
    it("lets an admin grant and revoke time, independent of paid billing", async () => {
      const user = await h.createUser({ name: "Comped Cal" });
      assert.equal((await h.api.post(`/admin/users/${user.id}/plan`, { plan: "premium_plus", days: 14 }, { token: user.token })).status, 403);
      assert.equal((await h.api.post(`/admin/users/${user.id}/plan`, { plan: "premium_plus", days: 0 }, { token: admin.token })).status, 422);

      assert.equal((await h.api.post(`/admin/users/${user.id}/plan`, { plan: "premium_plus", days: 14, reason: "Beta tester" }, { token: admin.token })).status, 200);
      const view = (await overview(user)).subscription;
      assert.equal(view.plan, "premium_plus");
      assert.equal(view.source, "grant");

      // A paid Premium subscription alongside the grant: the better plan wins.
      await subscribe(user, "premium");
      assert.equal((await overview(user)).subscription.plan, "premium_plus");

      assert.equal((await h.api.del(`/admin/users/${user.id}/plan`, { token: admin.token })).status, 200);
      assert.equal((await overview(user)).subscription.plan, "premium", "the paid plan remains");
    });
  });

  describe("kill switch", () => {
    it("turning billing off stops new checkouts but not cancellations", async () => {
      const user = await h.createUser({ name: "Switch Sid" });
      await subscribe(user, "premium");
      await h.setFlag("billing", false);
      assert.equal((await h.api.post("/billing/checkout", { plan: "premium_plus" }, { token: user.token })).status, 403);
      assert.equal((await h.api.post("/billing/upgrade", { plan: "premium_plus" }, { token: user.token })).status, 403);
      assert.equal((await h.api.post("/billing/cancel", undefined, { token: user.token })).status, 200, "people can always leave");
      await h.setFlag("billing", true);
    });

    it("has no webhook endpoint for the sandbox provider, and rejects unknown providers", async () => {
      const post = (provider: string) => fetch(`${(h as unknown as { baseUrl: string }).baseUrl}/api/billing/webhook/${provider}`, { method: "POST", body: "{}" });
      assert.equal((await post("stripe")).status, 404);
      assert.equal((await post("mock")).status, 400);
    });
  });
});
