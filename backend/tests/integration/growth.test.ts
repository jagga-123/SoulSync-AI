import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

describe("growth: referrals, rewards and the waitlist", () => {
  let h: Harness;
  let admin: TestUser;

  before(async () => {
    h = await startHarness();
    admin = await h.makeAdmin(await h.createUser({ name: "Growth Admin" }));
  });
  after(() => h.stop());

  const register = (name: string, email: string, extra: Record<string, unknown> = {}) =>
    h.api.post("/auth/register", { fullName: name, email, password: "Passw0rd!23", ...extra });
  const summary = async (user: TestUser) => (await h.api.get("/growth/referrals", { token: user.token })).body.data;
  const planOf = async (user: TestUser) => (await h.api.get("/features", { token: user.token })).body.data.plan;

  /** Registers a friend through a referral code, and returns them as a signed-in user with a profile. */
  async function referredFriend(code: string, name: string): Promise<TestUser> {
    const email = `${name.toLowerCase().replace(/\W+/g, ".")}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@test.local`;
    const registered = await register(name, email, { referralCode: code });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    const login = await h.api.post("/auth/login", { email, password: "Passw0rd!23" });
    const friend: TestUser = { id: login.body.data.user.id, email, name, token: login.body.data.token };
    await h.api.post("/profile", { age: 28, gender: "other", city: "Testville", bio: "Hi", interests: ["Travel"], relationshipGoal: "serious" }, { token: friend.token });
    return friend;
  }

  describe("referral codes", () => {
    it("gives every member one stable, readable code and a share link", async () => {
      const user = await h.createUser({ name: "Referrer Rex" });
      const first = await summary(user);
      assert.match(first.code, /^[A-HJKMNP-Z2-9]{8}$/, "no 0/O/1/I/L");
      assert.equal(first.link, `http://localhost:3000/register?ref=${first.code}`);
      assert.equal((await summary(user)).code, first.code, "the code never changes");
      assert.deepEqual(first.counts, { invited: 0, successful: 0, pending: 0 });
      assert.deepEqual(first.tiers.map((t: { threshold: number }) => t.threshold), [1, 3, 5, 10]);
      assert.equal(first.nextTier.threshold, 1);
      assert.equal((await h.api.get("/growth/referrals")).status, 401);
    });

    it("hands out distinct codes under concurrent first requests", async () => {
      const users = await h.seedUsers(6);
      const codes = await Promise.all(users.map(async (u) => (await summary(u)).code));
      assert.equal(new Set(codes).size, 6);
      const again = await Promise.all([summary(users[0]!), summary(users[0]!), summary(users[0]!)]);
      assert.equal(new Set(again.map((s) => s.code)).size, 1, "parallel calls for one user agree on one code");
    });
  });

  describe("attribution", () => {
    let referrer: TestUser;
    let code: string;

    before(async () => {
      referrer = await h.createUser({ name: "Attribution Ann" });
      code = (await summary(referrer)).code;
    });

    it("credits the referrer as 'pending' when a friend signs up with their code (any case, padded)", async () => {
      await referredFriend(code.toLowerCase(), "Friend Fred");
      const s = await summary(referrer);
      assert.deepEqual(s.counts, { invited: 1, successful: 0, pending: 1 });
      assert.deepEqual(s.recent.map((r: { name: string; status: string }) => [r.name, r.status]), [["Friend", "pending"]], "first name only");
    });

    it("never blocks registration over a bad or unknown code", async () => {
      const res = await register("Bad Code Bo", `badcode.${Date.now()}@test.local`, { referralCode: "ZZZZZZZZ" });
      assert.equal(res.status, 201);
      assert.equal((await summary(referrer)).counts.invited, 1);
    });

    it("doesn't credit a suspended referrer", async () => {
      const banned = await h.createUser({ name: "Banned Ben" });
      const bannedCode = (await summary(banned)).code;
      await h.api.post(`/admin/users/${banned.id}/suspend`, { reason: "Abuse" }, { token: admin.token });
      const res = await register("Late Friend", `latefriend.${Date.now()}@test.local`, { referralCode: bannedCode });
      assert.equal(res.status, 201);
      const { Referral } = await h.load("../../src/models/Referral.model");
      assert.equal(await Referral.countDocuments({ referrerId: banned.id }), 0);
    });

    it("turns off cleanly with the referrals flag", async () => {
      await h.setFlag("referrals", false);
      const friend = await register("Flag Off Friend", `flagoff.${Date.now()}@test.local`, { referralCode: code });
      assert.equal(friend.status, 201);
      const blocked = await h.api.get("/growth/referrals", { token: referrer.token });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.body.error.code, "FEATURE_DISABLED");
      assert.equal((await h.api.get("/features/public")).body.data.referrals, false);
      await h.setFlag("referrals", true);
      assert.equal((await summary(referrer)).counts.invited, 1, "nothing was attributed while off");
    });
  });

  describe("qualifying and rewards", () => {
    let referrer: TestUser;
    let code: string;

    before(async () => {
      referrer = await h.createUser({ name: "Rewarded Rae", verified: true });
      code = (await summary(referrer)).code;
    });

    it("counts a referral as successful only when the friend finishes their AI interview", async () => {
      const friend = await referredFriend(code, "Interview Ivy");
      assert.equal((await summary(referrer)).counts.successful, 0, "signing up alone isn't enough");
      await h.completeInterview(friend);

      const s = await summary(referrer);
      assert.deepEqual(s.counts, { invited: 1, successful: 1, pending: 0 });
      assert.equal(s.tiers[0].achieved, true);
      assert.equal(s.tiers[0].granted, false, "rewards are off, so nothing has been paid");
      assert.equal(await planOf(referrer), "free");

      const { notifications } = (await h.api.get("/notifications", { token: referrer.token })).body.data;
      assert.ok(notifications.some((n: { type: string }) => n.type === "referral"));
    });

    it("counts each friend once, even if they redo the interview", async () => {
      const friend = await referredFriend(code, "Redo Rick");
      await h.completeInterview(friend);
      await h.api.post("/ai/interview/restart", {}, { token: friend.token });
      await h.completeInterview(friend);
      assert.equal((await summary(referrer)).counts.successful, 2);
    });

    it("pays every milestone already earned, retroactively, the moment rewards are switched on — once", async () => {
      await h.setFlag("referral_rewards", true);
      const s = await summary(referrer);
      assert.equal(s.rewardsEnabled, true);
      assert.equal(s.tiers[0].granted, true);
      assert.equal(await planOf(referrer), "premium");

      await summary(referrer);
      await summary(referrer);
      const { ReferralReward } = await h.load("../../src/models/Referral.model");
      assert.equal(await ReferralReward.countDocuments({ userId: referrer.id }), 1, "the 1-referral reward is not re-paid");
      const { Subscription } = await h.load("../../src/models/Subscription.model");
      const grant = await Subscription.findOne({ userId: referrer.id, source: "grant" });
      const days = (grant.expiryDate.getTime() - Date.now()) / 86_400_000;
      assert.ok(days > 6 && days <= 7.1, `1 referral = 7 days, got ${days.toFixed(2)}`);
    });

    it("escalates through the tiers as more friends qualify", async () => {
      // 3 successful → +30 days of Premium
      const third = await referredFriend(code, "Third Tess");
      await h.completeInterview(third);
      const s = await summary(referrer);
      assert.equal(s.counts.successful, 3);
      assert.equal(s.tiers[1].granted, true);
      assert.equal(s.nextTier.threshold, 5);
      const { Subscription } = await h.load("../../src/models/Subscription.model");
      const grant = await Subscription.findOne({ userId: referrer.id, source: "grant" });
      assert.ok((grant.expiryDate.getTime() - Date.now()) / 86_400_000 > 36, "the new 30 days stack on the remaining week");

      // 5 successful → Premium Plus
      for (const name of ["Fourth Finn", "Fifth Fay"]) await h.completeInterview(await referredFriend(code, name));
      await summary(referrer);
      assert.equal(await planOf(referrer), "premium_plus");
    });

    it("can be switched off again without clawing anything back", async () => {
      await h.setFlag("referral_rewards", false);
      assert.equal(await planOf(referrer), "premium_plus");
      assert.equal((await summary(referrer)).rewardsEnabled, false);
    });
  });

  describe("inviting friends by email", () => {
    let member: TestUser;

    before(async () => {
      member = await h.createUser({ name: "Inviter Ines", verified: true });
    });

    it("sends personalised invites carrying the member's code, skipping people who already have an account", async () => {
      const existing = await h.createUser({ name: "Already Here" });
      const sent = await h.api.post("/growth/referrals/invite", { emails: ["Newbie@Test.Local", "newbie@test.local", existing.email, member.email] }, { token: member.token });
      assert.equal(sent.status, 200);
      await h.settle();

      const { code } = await summary(member);
      const invites = h.outbox.filter((m) => /invite|joined|meet/i.test(m.subject) && m.to === "newbie@test.local");
      assert.equal(invites.length, 1, "duplicates collapse into one email");
      assert.ok(invites[0]!.html.includes(`ref=${code}`));
      assert.ok(invites[0]!.html.includes("Inviter Ines"));
      assert.ok(!h.outbox.some((m) => m.to === existing.email && /invite/i.test(m.subject)), "existing members aren't emailed (and aren't revealed)");
      assert.ok(!h.outbox.some((m) => m.to === member.email && /invite/i.test(m.subject)));
    });

    it("doesn't re-invite the same address for a week", async () => {
      const before = h.outbox.length;
      await h.api.post("/growth/referrals/invite", { emails: ["newbie@test.local"] }, { token: member.token });
      await h.settle();
      assert.equal(h.outbox.length, before);
    });

    it("validates addresses and enforces a daily cap", async () => {
      assert.equal((await h.api.post("/growth/referrals/invite", { emails: ["not-an-email"] }, { token: member.token })).status, 422);
      assert.equal((await h.api.post("/growth/referrals/invite", { emails: [] }, { token: member.token })).status, 422);
      assert.equal((await h.api.post("/growth/referrals/invite", { emails: Array.from({ length: 6 }, (_, i) => `x${i}@test.local`) }, { token: member.token })).status, 422, "max 5 per request");

      const spammer = await h.createUser({ name: "Spammer Sid" });
      for (let batch = 0; batch < 3; batch++) {
        const emails = Array.from({ length: 5 }, (_, i) => `cap${batch}${i}@test.local`);
        assert.equal((await h.api.post("/growth/referrals/invite", { emails }, { token: spammer.token })).status, 200);
      }
      await h.settle();
      const over = await h.api.post("/growth/referrals/invite", { emails: ["one.more@test.local"] }, { token: spammer.token });
      assert.equal(over.status, 429);
    });
  });

  describe("waitlist", () => {
    it("takes an email publicly, gives a position, and answers identically for repeats", async () => {
      const first = await h.api.post("/growth/waitlist", { email: "Early@Test.Local" });
      assert.equal(first.status, 200);
      assert.deepEqual(first.body.data, { position: 1, alreadyOnList: false });
      const second = await h.api.post("/growth/waitlist", { email: "second@test.local" });
      assert.equal(second.body.data.position, 2);

      const repeat = await h.api.post("/growth/waitlist", { email: "early@test.local" });
      assert.deepEqual(repeat.body.data, { position: 1, alreadyOnList: true });
      await h.settle();
      assert.equal(h.outbox.filter((m) => m.to === "early@test.local").length, 1, "one confirmation, not two");
      assert.equal((await h.api.post("/growth/waitlist", { email: "nope" })).status, 422);
    });

    it("stays open by default: registration needs no invite", async () => {
      assert.equal((await h.api.get("/features/public")).body.data.waitlistMode, false);
      assert.equal((await register("Open Door", `opendoor.${Date.now()}@test.local`)).status, 201);
    });

    describe("invite-only mode", () => {
      let voucher: TestUser;
      let plainUser: TestUser;

      before(async () => {
        // Members must exist before the door closes — the test helper registers through the public API.
        voucher = await h.createUser({ name: "Vouching Val" });
        plainUser = await h.createUser({ name: "Plain User" });
        await h.setFlag("waitlist_mode", true);
      });
      after(async () => {
        await h.setFlag("waitlist_mode", false);
      });

      it("turns away strangers, but existing members can still log in", async () => {
        const res = await register("Stranger Sue", `stranger.${Date.now()}@test.local`);
        assert.equal(res.status, 403);
        assert.equal(res.body.error.code, "WAITLIST_REQUIRED");
        assert.equal((await h.api.get("/features/public")).body.data.waitlistMode, true);
        assert.equal((await h.api.post("/auth/login", { email: admin.email, password: "Passw0rd!23" })).status, 200);
      });

      it("lets someone in with a real member's referral code", async () => {
        const { code } = await summary(voucher);
        assert.equal((await register("Vouched Vic", `vouched.${Date.now()}@test.local`, { referralCode: code })).status, 201);
        assert.equal((await register("Fake Fay", `fake.${Date.now()}@test.local`, { referralCode: "QQQQQQQQ" })).status, 403);
      });

      it("lets someone in with an admin-issued invite — bound to their own email", async () => {
        const email = "invited.person@test.local";
        await h.api.post("/growth/waitlist", { email });

        const forbidden = await h.api.post("/admin/waitlist/invite-next", { count: 1 }, { token: plainUser.token });
        assert.equal(forbidden.status, 403);

        const list = (await h.api.get("/admin/waitlist?status=waiting", { token: admin.token })).body.data.entries;
        const entry = list.find((e: { email: string }) => e.email === email);
        assert.equal((await h.api.post(`/admin/waitlist/${entry.id}/invite`, undefined, { token: admin.token })).status, 200);
        await h.settle();

        const mail = h.outbox.find((m) => m.to === email && /invite|access|ready/i.test(m.subject));
        assert.ok(mail, "invite email sent");
        const inviteCode = /invite=([a-z0-9]+)/.exec(mail!.html)?.[1];
        assert.ok(inviteCode && inviteCode.length >= 12);

        assert.equal((await register("Passed Around", `someone.else.${Date.now()}@test.local`, { inviteCode })).status, 403, "a forwarded invite doesn't work for another address");
        assert.equal((await register("Invited Ida", email, { inviteCode: "wrongcode123" })).status, 403);
        assert.equal((await register("Invited Ida", email, { inviteCode })).status, 201);

        const joined = (await h.api.get("/admin/waitlist?status=joined", { token: admin.token })).body.data.entries;
        assert.ok(joined.some((e: { email: string }) => e.email === email), "the entry is marked as joined");
      });

      it("invites the next N people in line, oldest first", async () => {
        for (const n of ["line.a", "line.b", "line.c"]) await h.api.post("/growth/waitlist", { email: `${n}@test.local` });
        const res = await h.api.post("/admin/waitlist/invite-next", { count: 2 }, { token: admin.token });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.invited, 2);
        assert.equal((await h.api.post("/admin/waitlist/invite-next", { count: 0 }, { token: admin.token })).status, 422);
        // "early@" and "second@" joined the list first, so they're the two at the front of the line.
        const invited = (await h.api.get("/admin/waitlist?status=invited", { token: admin.token })).body.data.entries.map((e: { email: string }) => e.email);
        assert.deepEqual(invited.sort(), ["early@test.local", "second@test.local"]);
        const stillWaiting = (await h.api.get("/admin/waitlist?status=waiting", { token: admin.token })).body.data.entries.map((e: { email: string }) => e.email);
        assert.deepEqual(stillWaiting, ["line.a@test.local", "line.b@test.local", "line.c@test.local"], "the rest keep their order");
      });
    });
  });
});
