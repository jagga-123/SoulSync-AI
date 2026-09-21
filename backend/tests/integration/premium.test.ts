import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

describe("premium perks", () => {
  let h: Harness;
  let admin: TestUser;

  const grant = (user: TestUser, plan: "premium" | "premium_plus", days = 30) =>
    h.api.post(`/admin/users/${user.id}/plan`, { plan, days }, { token: admin.token });

  before(async () => {
    h = await startHarness();
    admin = await h.makeAdmin(await h.createUser({ name: "Admin", profile: true }));
  });
  after(() => h.stop());

  describe("free-plan like limit", () => {
    let liker: TestUser;
    let targets: TestUser[];

    before(async () => {
      liker = await h.createUser({ name: "Eager Liker", profile: true });
      targets = await h.seedUsers(25, { profile: true });
    });

    it("does nothing while like_limits is off (existing behaviour unchanged)", async () => {
      for (const target of targets.slice(0, 22)) {
        const res = await h.api.post(`/likes/send/${target.id}`, undefined, { token: liker.token });
        assert.equal(res.status, 201);
      }
    });

    it("caps free users at 20 a day once the limit is switched on", async () => {
      const capped = await h.createUser({ name: "Capped", profile: true });
      await h.setFlag("like_limits", true);

      for (let i = 0; i < 20; i++) {
        const res = await h.api.post(`/likes/send/${targets[i]!.id}`, undefined, { token: capped.token });
        assert.equal(res.status, 201, `like ${i + 1}`);
      }
      const blocked = await h.api.post(`/likes/send/${targets[20]!.id}`, undefined, { token: capped.token });
      assert.equal(blocked.status, 402);
      assert.equal(blocked.body.error.code, "LIKE_LIMIT_REACHED");
      assert.equal(blocked.body.error.limit, 20);
      assert.equal(blocked.body.error.used, 20);
      assert.equal(blocked.body.error.requiredPlan, "premium");

      const allowance = await h.api.get("/premium/likes/allowance", { token: capped.token });
      assert.deepEqual(
        { unlimited: allowance.body.data.allowance.unlimited, remaining: allowance.body.data.allowance.remaining },
        { unlimited: false, remaining: 0 },
      );
    });

    it("keeps limiting paid users until the 'unlimited likes' perk itself is on", async () => {
      const subscriber = await h.createUser({ name: "Subscriber", profile: true });
      await grant(subscriber, "premium");
      await h.setFlag("like_limits", true);
      await h.setFlag("unlimited_likes", false);

      for (let i = 0; i < 20; i++) await h.api.post(`/likes/send/${targets[i]!.id}`, undefined, { token: subscriber.token });
      const blocked = await h.api.post(`/likes/send/${targets[20]!.id}`, undefined, { token: subscriber.token });
      assert.equal(blocked.status, 402, "perk flag off → nobody is exempt");
    });

    it("lets subscribers like without limit once the perk is on — and ends when the plan does", async () => {
      const subscriber = await h.createUser({ name: "Unlimited", profile: true });
      await grant(subscriber, "premium");
      await h.setFlag("like_limits", true);
      await h.setFlag("unlimited_likes", true);

      for (let i = 0; i < 23; i++) {
        const res = await h.api.post(`/likes/send/${targets[i]!.id}`, undefined, { token: subscriber.token });
        assert.equal(res.status, 201, `like ${i + 1}`);
      }

      // Plan ends → the limit applies again (already 23 today, so blocked immediately).
      const { Subscription } = await h.load("../../src/models/Subscription.model");
      await Subscription.updateOne({ userId: subscriber.id }, { $set: { expiryDate: new Date(Date.now() - 1000) } });
      const after = await h.api.post(`/likes/send/${targets[23]!.id}`, undefined, { token: subscriber.token });
      assert.equal(after.status, 402);
    });
  });

  describe("recommendation cap (priority recommendations)", () => {
    let viewer: TestUser;

    before(async () => {
      viewer = (await h.seedUsers(1, { profile: true, aiProfile: true, prefix: "Viewer" }))[0]!;
      await h.seedUsers(8, { profile: true, aiProfile: true, prefix: "Candidate" });
    });

    it("returns everything while the perk flag is off", async () => {
      const res = await h.api.get("/ai/recommendations?limit=10", { token: viewer.token });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.recommendations.length, 8);
      assert.equal(res.body.data.capped, false);
    });

    it("shows free users 5, and paid plans 15–30, once live", async () => {
      await h.setFlag("priority_recommendations", true);

      const free = await h.api.get("/ai/recommendations?limit=10", { token: viewer.token });
      assert.equal(free.body.data.recommendations.length, 5);
      assert.equal(free.body.data.capped, true);
      assert.equal(free.body.data.cap, 5);

      await grant(viewer, "premium");
      const paid = await h.api.get("/ai/recommendations?limit=10", { token: viewer.token });
      assert.equal(paid.body.data.recommendations.length, 8);
      assert.equal(paid.body.data.capped, false);
    });

    after(() => h.setFlag("priority_recommendations", false));
  });

  describe("profile boost", () => {
    let viewer: TestUser;
    let low: TestUser;
    let high: TestUser;

    before(async () => {
      viewer = (await h.seedUsers(1, { profile: true, aiProfile: true, prefix: "BoostViewer" }))[0]!;
      // `high` matches the viewer perfectly; `low` shares far less.
      high = (await h.seedUsers(1, { profile: true, aiProfile: true, prefix: "HighMatch" }))[0]!;
      // Overlaps the viewer partially (a decent but clearly lower match).
      low = (
        await h.seedUsers(1, {
          profile: { interests: ["Travel", "Gaming"] },
          aiProfile: {
            interests: ["travel", "gaming"],
            values: ["honesty", "independence", "curiosity"],
            lifestyleTraits: ["active", "homebody"],
            emotionalTraits: ["calm", "sensitive"],
          },
          prefix: "LowMatch",
        })
      )[0]!;
    });

    it("is unavailable until enabled, then requires the right plan", async () => {
      const plus = await h.createUser({ name: "Plus", profile: true });
      assert.equal((await h.api.post("/premium/boost", undefined, { token: plus.token })).status, 403);

      await h.setFlag("profile_boost", true);
      assert.equal((await h.api.post("/premium/boost", undefined, { token: plus.token })).status, 402);

      await grant(plus, "premium");
      const premiumOnly = await h.api.post("/premium/boost", undefined, { token: plus.token });
      assert.equal(premiumOnly.status, 402, "Premium doesn't include boosts — Premium Plus does");
      assert.equal(premiumOnly.body.error.requiredPlan, "premium_plus");
    });

    it("puts a boosted profile first in others' recommendations without changing its score", async () => {
      await h.setFlag("profile_boost", true);
      const before = await h.api.get("/ai/recommendations?limit=30", { token: viewer.token });
      const order = before.body.data.recommendations.map((r: { user: { id: string } }) => r.user.id);
      assert.ok(order.indexOf(high.id) < order.indexOf(low.id), "high match ranks above low match to begin with");
      const lowScore = before.body.data.recommendations.find((r: { user: { id: string } }) => r.user.id === low.id).ai.score;
      const highScore = before.body.data.recommendations.find((r: { user: { id: string } }) => r.user.id === high.id).ai.score;
      assert.ok(lowScore >= 40 && lowScore < highScore, `expected 40 <= ${lowScore} < ${highScore}`);

      await grant(low, "premium_plus");
      const boosted = await h.api.post("/premium/boost", undefined, { token: low.token });
      assert.equal(boosted.status, 200);
      assert.equal(boosted.body.data.boost.active, true);
      assert.equal(boosted.body.data.boost.remaining, 3);

      const after = await h.api.get("/ai/recommendations?limit=30", { token: viewer.token });
      const boostedFirst = after.body.data.recommendations[0];
      assert.equal(boostedFirst.user.id, low.id, "boosted profile leads");
      assert.equal(boostedFirst.ai.score, lowScore, "the displayed score stays honest");
    });

    it("won't stack boosts, and enforces the monthly quota", async () => {
      const plus = await h.createUser({ name: "Quota Plus", profile: true });
      await grant(plus, "premium_plus");
      await h.setFlag("profile_boost", true);

      assert.equal((await h.api.post("/premium/boost", undefined, { token: plus.token })).status, 200);
      const again = await h.api.post("/premium/boost", undefined, { token: plus.token });
      assert.equal(again.status, 409, "already boosted");

      // Use up the rest of the month's quota (4) with boosts that have already ended.
      const { ProfileBoost } = await h.load("../../src/models/Engagement.models");
      await ProfileBoost.updateMany({ userId: plus.id }, { $set: { endsAt: new Date(Date.now() - 1000) } });
      for (let i = 0; i < 3; i++) {
        await ProfileBoost.create({ userId: plus.id, startsAt: new Date(Date.now() - 5000), endsAt: new Date(Date.now() - 1000) });
      }
      const exhausted = await h.api.post("/premium/boost", undefined, { token: plus.token });
      assert.equal(exhausted.status, 409);
      assert.equal(exhausted.body.error.code, "BOOST_QUOTA_REACHED");
    });
  });

  describe("AI deep analysis (the paid AI feature)", () => {
    it("is off by default, so no paid AI work can happen", async () => {
      const user = await h.createUser({ name: "Deep Off", profile: true });
      await grant(user, "premium_plus");
      const res = await h.api.post("/premium/deep-analysis", undefined, { token: user.token });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, "FEATURE_DISABLED");
    });

    it("needs the right plan, then a finished interview", async () => {
      await h.setFlag("ai_deep_analysis", true);
      const user = await h.createUser({ name: "Deep One", profile: true });

      const free = await h.api.post("/premium/deep-analysis", undefined, { token: user.token });
      assert.equal(free.status, 402);
      assert.equal(free.body.error.requiredPlan, "premium_plus");

      await grant(user, "premium");
      assert.equal((await h.api.post("/premium/deep-analysis", undefined, { token: user.token })).status, 402, "Premium alone doesn't include it");

      await grant(user, "premium_plus");
      const noInterview = await h.api.post("/premium/deep-analysis", undefined, { token: user.token });
      assert.equal(noInterview.status, 409);
    });

    it("generates a full analysis, stores it, reuses it, and regenerates when the profile changes", async () => {
      await h.setFlag("ai_deep_analysis", true);
      const user = await h.createUser({ name: "Deep Two", profile: true });
      await h.completeInterview(user);
      await grant(user, "premium_plus");

      const empty = await h.api.get("/premium/deep-analysis", { token: user.token });
      assert.equal(empty.status, 200);
      assert.equal(empty.body.data.analysis, null);
      assert.equal(empty.body.data.hasAIProfile, true);

      const created = await h.api.post("/premium/deep-analysis", undefined, { token: user.token });
      assert.equal(created.status, 200, JSON.stringify(created.body));
      const analysis = created.body.data.analysis;
      assert.equal(analysis.source, "heuristic", "no AI provider configured → built-in engine");
      assert.ok(analysis.idealPartner.summary.length > 40);
      assert.ok(analysis.idealPartner.qualities.length >= 3);
      assert.ok(analysis.communicationTips.length >= 2);
      assert.equal(analysis.growthAreas.length, 3);
      assert.equal(analysis.relationshipPitfalls.length, 3);
      assert.equal(analysis.conversationStarters.length, 4);
      assert.ok(analysis.datingStrategy.length > 40);
      assert.equal(created.body.data.stale, false);

      // A second request inside the cooldown returns the stored copy (no new spend).
      const again = await h.api.post("/premium/deep-analysis?force=true", undefined, { token: user.token });
      assert.equal(again.body.data.analysis.generatedAt, analysis.generatedAt);

      // Retaking the interview changes the AI profile → the stored analysis is stale and is rebuilt.
      await h.api.post("/ai/interview/restart", {}, { token: user.token });
      await h.completeInterview({ ...user });
      const stale = await h.api.get("/premium/deep-analysis", { token: user.token });
      assert.equal(stale.body.data.stale, true);
      const rebuilt = await h.api.post("/premium/deep-analysis", undefined, { token: user.token });
      assert.notEqual(rebuilt.body.data.analysis.generatedAt, analysis.generatedAt);
      assert.equal(rebuilt.body.data.stale, false);
    });
  });

  describe("read receipts insights", () => {
    it("reports how many of your messages were read, and how fast", async () => {
      await h.setFlag("read_receipts_insights", true);
      const sender = await h.createUser({ name: "Sender", profile: true });
      const receiver = await h.createUser({ name: "Receiver", profile: true });
      const { matchId } = await h.makeMatch(sender, receiver);
      const conversation = await h.api.post(`/conversations/start/${matchId}`, undefined, { token: sender.token });
      const conversationId = conversation.body.data.conversation.id;

      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        const sent = await h.api.post("/messages/send", { conversationId, content: `hello ${i}` }, { token: sender.token });
        assert.equal(sent.status, 201, JSON.stringify(sent.body));
        ids.push(sent.body.data.message.id);
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
      for (const id of ids.slice(0, 3)) await h.api.post(`/messages/read/${id}`, undefined, { token: receiver.token });

      assert.equal((await h.api.get("/premium/read-receipts", { token: sender.token })).status, 402);
      await grant(sender, "premium");

      const res = await h.api.get("/premium/read-receipts", { token: sender.token });
      assert.equal(res.status, 200);
      const { totals, partners, readsByHourUtc } = res.body.data;
      assert.deepEqual({ sent: totals.sent, read: totals.read, unread: totals.unread, readRate: totals.readRate }, { sent: 4, read: 3, unread: 1, readRate: 75 });
      assert.ok(totals.medianReadSeconds >= 0);
      assert.equal(partners.length, 1);
      assert.equal(partners[0].name, "Receiver");
      assert.equal(partners[0].readRate, 75);
      assert.equal(readsByHourUtc.length, 24);
      assert.equal(readsByHourUtc.reduce((sum: number, hour: { reads: number }) => sum + hour.reads, 0), 3);
    });
  });
});
