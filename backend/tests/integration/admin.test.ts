import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

const CRON_SECRET = "cron-secret-for-tests-1234567890";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("admin dashboard, analytics and access control", () => {
  let h: Harness;
  let admin: TestUser;
  let ada: TestUser;
  let bea: TestUser;
  let cy: TestUser;
  let dee: TestUser;

  const get = async (path: string, user: TestUser = admin) => h.api.get(path, { token: user.token });
  const fresh = async <T = any>(path: string): Promise<T> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Dashboards are cached for a minute; tests read after each change.
    (await h.load("../../src/services/analytics.service")).clearAnalyticsCache();
    const res = await get(path);
    assert.equal(res.status, 200, `${path}: ${JSON.stringify(res.body)}`);
    return res.body.data;
  };

  before(async () => {
    h = await startHarness({ env: { CRON_SECRET } });
    admin = await h.makeAdmin(await h.createUser({ name: "Root Admin" }));

    // A small, known world:
    //   5 users (admin, ada, bea, cy, dee) — 3 profiles (ada, bea, cy)
    //   ada + bea matched (1 like, accepted) and ada sent 2 messages
    //   cy completed the AI interview
    //   bea pays for Premium; ada holds a complimentary Premium Plus (must NOT count as a subscriber)
    ada = await h.createUser({ name: "Ada Lovelace", profile: true });
    bea = await h.createUser({ name: "Bea Turing", profile: true });
    cy = await h.createUser({ name: "Cy Hopper", profile: true });
    dee = await h.createUser({ name: "Dee Suspended" });

    const { matchId } = await h.makeMatch(ada, bea);
    const conversationId = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: ada.token })).body.data.conversation.id;
    for (const content of ["hello", "how are you"]) await h.api.post("/messages/send", { conversationId, content }, { token: ada.token });

    await h.completeInterview(cy);

    await h.setFlag("billing", true);
    const started = await h.api.post("/billing/checkout", { plan: "premium", interval: "monthly" }, { token: bea.token });
    await h.api.post("/billing/mock/complete", { session: new URL(started.body.data.url).searchParams.get("session") }, { token: bea.token });
    await h.api.post(`/admin/users/${ada.id}/plan`, { plan: "premium_plus", days: 30, reason: "Beta tester" }, { token: admin.token });
    await h.settle();
    await sleep(300); // lastActiveAt is written fire-and-forget
  });
  after(() => h.stop());

  describe("access control", () => {
    const ADMIN_GETS = [
      "/admin/overview", "/admin/analytics/funnel", "/admin/analytics/rates", "/admin/analytics/revenue",
      "/admin/analytics/timeseries?metric=registrations", "/admin/system", "/admin/users", "/admin/reports",
      "/admin/feature-flags", "/admin/audit-log", "/admin/email-log", "/admin/jobs", "/admin/waitlist",
    ];

    it("rejects every admin route without a login (401) and for ordinary members (403)", async () => {
      for (const path of ADMIN_GETS) {
        assert.equal((await h.api.get(path)).status, 401, `${path} anonymous`);
        assert.equal((await h.api.get(path, { token: ada.token })).status, 403, `${path} member`);
      }
      assert.equal((await h.api.post(`/admin/users/${bea.id}/suspend`, { reason: "nope" }, { token: ada.token })).status, 403);
      assert.equal((await h.api.post(`/admin/users/${bea.id}/delete`, { confirmEmail: bea.email }, { token: ada.token })).status, 403);
      assert.equal((await h.api.put("/admin/feature-flags/billing", { enabled: true }, { token: ada.token })).status, 403);
    });

    it("honours a demotion immediately — the role comes from the database, not the token", async () => {
      const second = await h.makeAdmin(await h.createUser({ name: "Temp Admin" }));
      assert.equal((await get("/admin/overview", second)).status, 200);
      const { User } = await h.load("../../src/models/User.model");
      await User.updateOne({ _id: second.id }, { $set: { role: "user" } });
      assert.equal((await get("/admin/overview", second)).status, 403);
    });

    it("never trusts a role claim smuggled into registration", async () => {
      const res = await h.api.post("/auth/register", { fullName: "Sneaky Sam", email: `sneaky.${Date.now()}@test.local`, password: "Passw0rd!23", role: "admin" });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.user.role, "user");
    });

    describe("configured admin emails (ADMIN_EMAILS=admin@test.local)", () => {
      it("do NOT become admin just by registering the address — the email must be verified", async () => {
        const registered = await h.api.post("/auth/register", { fullName: "Squatter", email: "admin@test.local", password: "Passw0rd!23" });
        assert.equal(registered.status, 201);
        await h.settle();
        const login = await h.api.post("/auth/login", { email: "admin@test.local", password: "Passw0rd!23" });
        assert.equal(login.body.data.user.role, "user", "an unverified claim to the admin address grants nothing");
        assert.equal((await h.api.get("/admin/overview", { token: login.body.data.token })).status, 403);

        // ...and the startup bootstrap skips it too.
        const { ensureAdmins } = await h.load("../../src/services/account.service");
        assert.equal(await ensureAdmins(), 0);
      });

      it("become admin once they prove they own the address, without needing a fresh login", async () => {
        const login = await h.api.post("/auth/login", { email: "admin@test.local", password: "Passw0rd!23" });
        const mail = h.outbox.filter((m) => m.to === "admin@test.local" && /verify/i.test(m.subject)).at(-1);
        assert.ok(mail, "a verification email was sent");
        const token = /token=([0-9a-f]{24}\.[0-9a-f]+)/.exec(mail.html)?.[1];
        assert.ok(token);

        assert.equal((await h.api.post("/account/verify-email", { token })).status, 200);
        assert.equal((await h.api.get("/admin/overview", { token: login.body.data.token })).status, 200);
      });

      it("are promoted by the startup bootstrap only when verified", async () => {
        const { User } = await h.load("../../src/models/User.model");
        await User.updateOne({ email: "admin@test.local" }, { $set: { role: "user" } });
        const { ensureAdmins } = await h.load("../../src/services/account.service");
        assert.equal(await ensureAdmins(), 1);
        assert.equal((await User.findOne({ email: "admin@test.local" })).role, "admin");
        assert.equal(await ensureAdmins(), 0, "idempotent");
      });
    });
  });

  describe("overview KPIs", () => {
    it("reports users, matches, messages, interviews and premium subscribers", async () => {
      const o = await fresh("/admin/overview");
      assert.equal(o.users.total, 8, "5 in the world + the address-claim user + Temp Admin + Sneaky Sam");
      assert.ok(o.users.active24h >= 3 && o.users.active7d >= o.users.active24h && o.users.active30d >= o.users.active7d);
      assert.equal(o.users.new7d, 8);
      assert.equal(o.users.suspended, 0);
      assert.equal(o.matches.total, 1);
      assert.equal(o.matches.last7d, 1);
      assert.equal(o.messages.total, 2);
      assert.deepEqual(o.likes, { total: 1, accepted: 1 });
      assert.equal(o.interviews.completed, 1);
      assert.equal(o.premium.subscribers, 1, "Bea pays; Ada's complimentary plan isn't a subscriber");
      assert.deepEqual(o.premium.byPlan, { premium: 1, premium_plus: 0 });
      assert.equal(o.premium.mrrUsd, 9.99);
      assert.equal(o.premium.newLast30d, 1);
      assert.equal(o.moderation.pendingReports, 0);
      assert.ok(o.generatedAt);
    });

    it("moves when the world does (suspension, reports) — and is cached between refreshes", async () => {
      const cached = await get("/admin/overview");
      await h.api.post(`/admin/users/${dee.id}/suspend`, { reason: "Spam" }, { token: admin.token });
      await h.api.post("/safety/reports", { userId: dee.id, reason: "spam" }, { token: cy.token });

      assert.equal((await get("/admin/overview")).body.data.users.suspended, cached.body.data.users.suspended, "still the cached snapshot");
      const o = await fresh("/admin/overview");
      assert.equal(o.users.suspended, 1);
      assert.equal(o.moderation.pendingReports, 1);
    });
  });

  describe("analytics", () => {
    it("computes conversion rates from the underlying data", async () => {
      const r = await fresh("/admin/analytics/rates");
      assert.deepEqual(r.counts, { users: 8, withProfile: 3, started: 1, completed: 1, matchedUsers: 2, totalLikes: 1, acceptedLikes: 1, matches: 1, activeConversations: 1, paidTotal: 1 });
      assert.equal(r.interviewCompletionRate, 33.3, "1 of 3 people with a profile");
      assert.equal(r.interviewFinishRate, 100, "everyone who started finished");
      assert.equal(r.matchRate, 66.7, "2 of 3");
      assert.equal(r.likeToMatchRate, 100);
      assert.equal(r.conversationRate, 100);
      assert.equal(r.premiumConversion, 12.5, "1 of 8 members");
    });

    it("builds the acquisition funnel step by step", async () => {
      const { steps } = await fresh("/admin/analytics/funnel");
      assert.deepEqual(steps.map((s: { key: string; count: number }) => [s.key, s.count]), [
        ["registered", 8], ["profile", 3], ["interview_started", 1], ["interview_completed", 1],
        ["first_like", 1], ["first_match", 2], ["first_message", 1], ["premium", 1],
      ]);
      assert.equal(steps[0].fromPrevious, null);
      assert.equal(steps[0].fromStart, 100);
      assert.equal(steps[1].fromPrevious, 37.5);
      assert.equal(steps[3].fromPrevious, 100);
    });

    it("returns a zero-filled daily time series so quiet days are 0, not gaps", async () => {
      const series = await fresh("/admin/analytics/timeseries?metric=registrations&days=7");
      assert.equal(series.metric, "registrations");
      assert.equal(series.points.length, 7);
      assert.equal(series.total, 8);
      const today = new Date().toISOString().slice(0, 10);
      assert.equal(series.points.at(-1).date, today);
      assert.equal(series.points.at(-1).value, 8);
      assert.ok(series.points.slice(0, 6).every((p: { value: number }) => p.value === 0));
      const dates = series.points.map((p: { date: string }) => p.date);
      assert.deepEqual([...dates].sort(), dates, "chronological");
      assert.equal(new Set(dates).size, 7, "one point per day");
    });

    it("supports every metric the dashboard charts", async () => {
      const expected: Record<string, number> = { registrations: 8, matches: 1, messages: 2, likes: 1, interviews: 1, premium: 1 };
      for (const [metric, total] of Object.entries(expected)) {
        assert.equal((await fresh(`/admin/analytics/timeseries?metric=${metric}&days=30`)).total, total, metric);
      }
      assert.equal((await fresh("/admin/analytics/timeseries?metric=likes")).days, 30, "default window");
    });

    it("validates the query", async () => {
      assert.equal((await get("/admin/analytics/timeseries?metric=bogus")).status, 422);
      assert.equal((await get("/admin/analytics/timeseries")).status, 422);
      assert.equal((await get("/admin/analytics/timeseries?metric=likes&days=6")).status, 422);
      assert.equal((await get("/admin/analytics/timeseries?metric=likes&days=91")).status, 422);
    });

    it("reports revenue per currency, never mixing them", async () => {
      const revenue = await fresh("/admin/analytics/revenue");
      assert.deepEqual(revenue.byCurrency, [{ currency: "usd", amountMinor: 999, payments: 1 }]);
    });

    it("handles a brand-new platform without dividing by zero", async () => {
      const empty = await startHarnessInIsolation();
      try {
        const rates = await empty.get("/admin/analytics/rates");
        assert.equal(rates.interviewCompletionRate, null);
        assert.equal(rates.matchRate, null);
        assert.equal(rates.messagesPerActiveUser7d, null);
        const funnel = await empty.get("/admin/analytics/funnel");
        assert.ok(funnel.steps.every((s: { fromPrevious: number | null }) => s.fromPrevious === null || s.fromPrevious === 0 || Number.isFinite(s.fromPrevious)));
      } finally {
        await empty.stop();
      }
    });
  });

  describe("user management", () => {
    it("lists, searches and filters members — without ever exposing password hashes", async () => {
      const all = (await get("/admin/users?limit=100")).body.data;
      assert.equal(all.pagination.total, 8);
      assert.ok(!JSON.stringify(all).match(/password|\$2[aby]\$/i), "no credentials in the response");
      assert.equal(all.users[0].plan !== undefined, true);

      const byName = (await get("/admin/users?query=turing")).body.data;
      assert.deepEqual(byName.users.map((u: { email: string }) => u.email), [bea.email]);
      assert.equal((await get(`/admin/users?query=${encodeURIComponent(ada.email.slice(0, 8))}`)).body.data.users[0].email, ada.email, "matches email too");

      assert.deepEqual((await get("/admin/users?status=suspended")).body.data.users.map((u: { id: string }) => u.id), [dee.id]);
      assert.ok((await get("/admin/users?status=active&limit=100")).body.data.users.every((u: { status: string }) => u.status !== "suspended"));
      assert.ok((await get("/admin/users?role=admin")).body.data.users.every((u: { role: string }) => u.role === "admin"));
    });

    it("treats the search box as text, not a regular expression", async () => {
      for (const hostile of ["(", ".*", "[a-z]+", "\\", "a{1,"]) {
        const res = await get(`/admin/users?query=${encodeURIComponent(hostile)}`);
        assert.equal(res.status, 200, `${hostile} must not crash the query`);
        assert.equal(res.body.data.users.length, 0, `${hostile} must not match everyone`);
      }
    });

    it("shows each member's live plan, and filters by it", async () => {
      const premium = (await get("/admin/users?plan=premium")).body.data.users;
      assert.deepEqual(premium.map((u: { id: string }) => u.id), [bea.id]);
      assert.equal((await get("/admin/users?plan=premium_plus")).body.data.users[0].id, ada.id, "complimentary plans show too");
      const list = (await get("/admin/users?limit=100")).body.data.users;
      assert.equal(list.find((u: { id: string }) => u.id === ada.id).plan, "premium_plus");
      assert.equal(list.find((u: { id: string }) => u.id === cy.id).plan, "free");
    });

    it("paginates and bounds the page size", async () => {
      const page = (await get("/admin/users?limit=2&page=3")).body.data;
      assert.equal(page.users.length, 2);
      assert.equal(page.pagination.totalPages, 4);
      assert.equal((await get("/admin/users?limit=101")).status, 422);
      assert.equal((await get("/admin/users?plan=platinum")).status, 422);
    });

    it("gives a full picture of one member for moderation and support", async () => {
      const detail = (await get(`/admin/users/${ada.id}`)).body.data;
      assert.equal(detail.user.email, ada.email);
      assert.equal(detail.user.plan, "premium_plus");
      assert.equal(detail.profile.city, "Testville");
      assert.deepEqual(detail.activity, { likesSent: 1, likesReceived: 0, matches: 1, messagesSent: 2 });
      assert.equal(detail.subscription.source, "grant");

      const beaDetail = (await get(`/admin/users/${bea.id}`)).body.data;
      assert.equal(beaDetail.payments.length, 1);
      assert.equal(beaDetail.payments[0].amount, 999);

      const deeDetail = (await get(`/admin/users/${dee.id}`)).body.data;
      assert.equal(deeDetail.user.status, "suspended");
      assert.equal(deeDetail.safety.reportsAgainst, 1);

      assert.equal((await get(`/admin/users/${"5f".repeat(12)}`)).status, 404);
      assert.equal((await get("/admin/users/not-an-id")).status, 400);
    });
  });

  describe("audit log", () => {
    it("records who did what, newest first, with details", async () => {
      const { entries, pagination } = (await get("/admin/audit-log")).body.data;
      assert.ok(pagination.total >= 2);
      const times = entries.map((e: { createdAt: string }) => Date.parse(e.createdAt));
      assert.deepEqual([...times].sort((a, b) => b - a), times);

      const suspension = entries.find((e: { action: string; targetId: string }) => e.action === "user.suspend" && e.targetId === dee.id);
      assert.equal(suspension.actorEmail, admin.email);
      assert.equal(suspension.targetType, "user");
      assert.equal(suspension.metadata.reason, "Spam");

      const grant = entries.find((e: { action: string }) => e.action === "subscription.grant");
      assert.deepEqual([grant.metadata.plan, grant.metadata.days, grant.metadata.reason], ["premium_plus", 30, "Beta tester"]);
      assert.equal((await get("/admin/audit-log?limit=1")).body.data.entries.length, 1);
    });

    it("cannot be edited or deleted through the API", async () => {
      assert.equal((await h.api.del("/admin/audit-log", { token: admin.token })).status, 404);
      assert.equal((await h.api.put("/admin/audit-log", {}, { token: admin.token })).status, 404);
    });
  });

  describe("operations", () => {
    it("shows system health: database, providers, jobs, flags, warnings", async () => {
      const sys = (await get("/admin/system")).body.data;
      assert.equal(sys.database.connected, true);
      assert.equal(sys.environment, "test");
      assert.deepEqual([sys.providers.email, sys.providers.payments, sys.providers.ai], ["log", "mock", "built-in engine"]);
      assert.ok(sys.uptimeSeconds >= 0 && sys.memoryMb > 0);
      assert.ok(sys.flagsTotal >= 15 && sys.flagsEnabled >= 1);
      assert.equal(sys.pendingReports, 1);
      assert.ok(Array.isArray(sys.warnings));
      assert.deepEqual(sys.jobs.map((j: { name: string }) => j.name).sort(), ["subscription-expiry", "weekly-report"]);
    });

    it("lists sent email with a status filter", async () => {
      const sent = (await get("/admin/email-log?status=sent&limit=100")).body.data;
      assert.ok(sent.entries.length > 5, "welcome, verification, match emails…");
      assert.ok(sent.entries.every((e: { status: string }) => e.status === "sent"));
      assert.ok(sent.entries.some((e: { template: string }) => e.template === "welcome"));
      assert.equal((await get("/admin/email-log?status=bogus")).status, 422);
    });

    it("runs a job on demand, rejecting unknown ones, and audits it", async () => {
      const run = await h.api.post("/admin/jobs/subscription-expiry/run?force=true", undefined, { token: admin.token });
      assert.equal(run.status, 200);
      assert.ok(run.body.data.result.status);
      assert.equal((await h.api.post("/admin/jobs/no-such-job/run", undefined, { token: admin.token })).status, 404);
      const audit = (await get("/admin/audit-log")).body.data.entries;
      assert.ok(audit.some((e: { action: string; targetId: string }) => e.action === "job.run" && e.targetId === "subscription-expiry"));
    });

    describe("external cron trigger (POST /api/internal/jobs/:name)", () => {
      const trigger = (name: string, headers: Record<string, string> = {}) => h.api.post(`/internal/jobs/${name}?force=true`, undefined, { headers });

      it("needs the shared secret, via either header form", async () => {
        assert.equal((await trigger("subscription-expiry")).status, 401);
        assert.equal((await trigger("subscription-expiry", { "x-cron-secret": "wrong-secret-of-the-same-length!!" })).status, 401);
        assert.equal((await trigger("subscription-expiry", { Authorization: "Bearer nope" })).status, 401);
        assert.equal((await trigger("subscription-expiry", { "x-cron-secret": CRON_SECRET })).status, 200);
        assert.equal((await trigger("subscription-expiry", { Authorization: `Bearer ${CRON_SECRET}` })).status, 200);
      });

      it("404s an unknown job, and a member's own token isn't a substitute for the secret", async () => {
        assert.equal((await trigger("no-such-job", { "x-cron-secret": CRON_SECRET })).status, 404);
        assert.equal((await trigger("subscription-expiry", { Authorization: `Bearer ${admin.token}` })).status, 401);
      });
    });
  });
});

/** A separate, empty platform (own database) to check the zero-data edge cases. */
async function startHarnessInIsolation() {
  // A second in-memory MongoDB + app instance can't share this process's mongoose connection,
  // so the empty-platform case is exercised at the service layer against a dropped database.
  const { default: mongoose } = await import("mongoose");
  const analytics = await import("../../src/services/analytics.service");
  const snapshot: Record<string, unknown[]> = {};
  const names = ["users", "profiles", "aiprofiles", "interviewsessions", "likes", "matches", "messages", "subscriptions", "payments", "conversations"];
  const db = mongoose.connection.db!;
  for (const name of names) {
    snapshot[name] = await db.collection(name).find({}).toArray();
    await db.collection(name).deleteMany({});
  }
  analytics.clearAnalyticsCache();

  return {
    get: async (path: string) => {
      analytics.clearAnalyticsCache();
      if (path.endsWith("rates")) return analytics.getRates();
      return analytics.getFunnel();
    },
    stop: async () => {
      for (const name of names) if (snapshot[name]?.length) await db.collection(name).insertMany(snapshot[name] as never[]);
      analytics.clearAnalyticsCache();
    },
  } as { get: (path: string) => Promise<any>; stop: () => Promise<void> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
