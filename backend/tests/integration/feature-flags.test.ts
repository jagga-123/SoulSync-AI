import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

describe("feature flags", () => {
  let h: Harness;
  let admin: TestUser;
  let user: TestUser;

  before(async () => {
    h = await startHarness();
    admin = await h.makeAdmin(await h.createUser({ name: "Admin One", profile: true }));
    user = await h.createUser({ name: "Regular Joe", profile: true });
  });
  after(() => h.stop());

  it("exposes only the logged-out-safe flags publicly, with safe defaults", async () => {
    const res = await h.api.get("/features/public");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { waitlistMode: false, billing: false, referrals: true });
  });

  it("returns every flag, the plan and the perks to a signed-in user", async () => {
    const res = await h.api.get("/features", { token: user.token });
    assert.equal(res.status, 200);
    const { flags, plan, perks } = res.body.data;
    assert.equal(plan, "free");
    // Everything that costs money or changes existing behaviour ships OFF.
    for (const key of ["billing", "like_limits", "unlimited_likes", "advanced_filters", "priority_recommendations", "profile_boost", "ai_deep_analysis", "read_receipts_insights", "referral_rewards", "waitlist_mode"]) {
      assert.equal(flags[key], false, `${key} should default to off`);
    }
    for (const key of ["notifications", "email_notifications", "referrals", "profile_views", "reports", "blocking"]) {
      assert.equal(flags[key], true, `${key} should default to on`);
    }
    assert.equal(perks.advanced_filters.available, false);
    assert.equal((await h.api.get("/features")).status, 401);
  });

  it("requires an admin to read or change flags", async () => {
    assert.equal((await h.api.get("/admin/feature-flags")).status, 401);
    assert.equal((await h.api.get("/admin/feature-flags", { token: user.token })).status, 403);
    assert.equal((await h.api.put("/admin/feature-flags/billing", { enabled: true }, { token: user.token })).status, 403);

    const list = await h.api.get("/admin/feature-flags", { token: admin.token });
    assert.equal(list.status, 200);
    assert.ok(list.body.data.flags.length >= 15);
    assert.ok(list.body.data.flags.every((f: { source: string }) => f.source === "default"));
  });

  it("rejects unknown flags and malformed bodies", async () => {
    assert.equal((await h.api.put("/admin/feature-flags/not_a_flag", { enabled: true }, { token: admin.token })).status, 404);
    assert.equal((await h.api.put("/admin/feature-flags/billing", { enabled: "yes" }, { token: admin.token })).status, 422);
    assert.equal((await h.api.put("/admin/feature-flags/billing", {}, { token: admin.token })).status, 422);
  });

  it("applies a change immediately and records where the value came from", async () => {
    const on = await h.api.put("/admin/feature-flags/billing", { enabled: true }, { token: admin.token });
    assert.equal(on.status, 200);
    const flag = on.body.data.flags.find((f: { key: string }) => f.key === "billing");
    assert.equal(flag.enabled, true);
    assert.equal(flag.source, "database");
    assert.equal((await h.api.get("/features/public")).body.data.billing, true);

    const reset = await h.api.del("/admin/feature-flags/billing", { token: admin.token });
    assert.equal(reset.status, 200);
    assert.equal((await h.api.get("/features/public")).body.data.billing, false);
  });

  it("writes every flag change to the audit log", async () => {
    await h.api.put("/admin/feature-flags/like_limits", { enabled: true }, { token: admin.token });
    const log = await h.api.get("/admin/audit-log", { token: admin.token });
    const entry = log.body.data.entries.find((e: { action: string; targetId: string }) => e.action === "feature_flag.set" && e.targetId === "like_limits");
    assert.ok(entry, "expected an audit entry");
    assert.equal(entry.actorEmail, admin.email);
    assert.equal(entry.metadata.enabled, true);
    assert.equal(entry.metadata.previous, false);
    await h.api.del("/admin/feature-flags/like_limits", { token: admin.token });
  });

  describe("gating a paid feature (advanced Discover filters)", () => {
    let others: TestUser[];

    before(async () => {
      others = await h.seedUsers(3, { profile: true });
      // Distinct ages/genders to filter on.
      const { Profile } = await h.load("../../src/models/Profile.model");
      await Profile.updateOne({ userId: others[0]!.id }, { $set: { age: 24, gender: "female", interests: ["Cooking"] } });
      await Profile.updateOne({ userId: others[1]!.id }, { $set: { age: 35, gender: "male", interests: ["Gaming"] } });
      await Profile.updateOne({ userId: others[2]!.id }, { $set: { age: 45, gender: "female", interests: ["cooking", "Travel"] } });
    });

    it("leaves basic Discover (and its filters) completely untouched while the flag is off", async () => {
      assert.equal((await h.api.get("/discover?city=Testville", { token: user.token })).status, 200);
      const res = await h.api.get("/discover?ageMin=30", { token: user.token });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, "FEATURE_DISABLED");
      assert.equal(res.body.error.feature, "advanced_filters");
    });

    it("asks a free user to upgrade once the feature is live", async () => {
      await h.setFlag("advanced_filters", true);
      const res = await h.api.get("/discover?ageMin=30", { token: user.token });
      assert.equal(res.status, 402);
      assert.equal(res.body.error.code, "UPGRADE_REQUIRED");
      assert.equal(res.body.error.currentPlan, "free");
      assert.equal(res.body.error.requiredPlan, "premium");
    });

    it("works for a subscriber, and every filter narrows the results", async () => {
      const grant = await h.api.post(`/admin/users/${user.id}/plan`, { plan: "premium", days: 30 }, { token: admin.token });
      assert.equal(grant.status, 200);

      const names = async (query: string) => {
        const res = await h.api.get(`/discover?${query}&limit=50`, { token: user.token });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        return res.body.data.users.map((u: { id: string }) => u.id).filter((id: string) => others.some((o) => o.id === id));
      };

      assert.deepEqual((await names("ageMin=30")).sort(), [others[1]!.id, others[2]!.id].sort());
      assert.deepEqual(await names("ageMax=30"), [others[0]!.id]);
      assert.deepEqual((await names("gender=female")).sort(), [others[0]!.id, others[2]!.id].sort());
      assert.deepEqual((await names("interests=cooking")).sort(), [others[0]!.id, others[2]!.id].sort(), "interests match case-insensitively");
      assert.deepEqual(await names("ageMin=30&gender=female"), [others[2]!.id]);
    });

    it("rejects an impossible range", async () => {
      const res = await h.api.get("/discover?ageMin=50&ageMax=30", { token: user.token });
      assert.equal(res.status, 422);
    });

    it("switching the flag off cuts access even for a paying user, immediately", async () => {
      await h.setFlag("advanced_filters", false);
      const res = await h.api.get("/discover?ageMin=30", { token: user.token });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, "FEATURE_DISABLED");
    });
  });
});
