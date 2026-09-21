import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

describe("email: verification, delivery rules, unsubscribe and the weekly report", () => {
  let h: Harness;
  let admin: TestUser;

  before(async () => {
    h = await startHarness();
    admin = await h.makeAdmin(await h.createUser({ name: "Email Admin" }));
  });
  after(() => h.stop());

  const mailsTo = (email: string, pattern: RegExp) => h.outbox.filter((m) => m.to === email && pattern.test(m.subject));
  const tokenFrom = (html: string, path: "verify-email" | "unsubscribe") => new RegExp(`/${path}\\?token=([^"&<\\s]+)`).exec(html)?.[1];
  const settings = async (user: TestUser) => (await h.api.get("/account/settings", { token: user.token })).body.data.settings;

  describe("welcome and verification", () => {
    it("sends a welcome email and a verification link at registration, but no marketing footer", async () => {
      const user = await h.createUser({ name: "Vera Verify" });
      const welcome = mailsTo(user.email, /welcome/i);
      const verify = mailsTo(user.email, /verify/i);
      assert.equal(welcome.length, 1);
      assert.equal(verify.length, 1);
      assert.match(verify[0]!.html, /\/verify-email\?token=[0-9a-f]{24}\.[0-9a-f]{64}/);
      assert.match(verify[0]!.text, /verify-email\?token=/);
      assert.ok(!welcome[0]!.html.includes("Unsubscribe"), "transactional mail has no unsubscribe footer");
      assert.equal(welcome[0]!.from, "SoulSync AI <no-reply@test.local>");
    });

    it("stores only a hash of the token, never the token itself", async () => {
      const user = await h.createUser({ name: "Hash Hana" });
      const raw = tokenFrom(mailsTo(user.email, /verify/i)[0]!.html, "verify-email")!.split(".")[1]!;
      const { User } = await h.load("../../src/models/User.model");
      const stored = (await User.findById(user.id).select("+emailVerification")).emailVerification;
      assert.match(stored.tokenHash, /^[0-9a-f]{64}$/);
      assert.notEqual(stored.tokenHash, raw);
      assert.ok(!JSON.stringify(stored).includes(raw));
      assert.ok(stored.expiresAt.getTime() - Date.now() > 23 * 3_600_000);
      assert.ok(!JSON.stringify((await h.api.get("/auth/me", { token: user.token })).body).includes("tokenHash"), "the hash never leaves the server");
    });

    it("verifies with the emailed link (idempotently), and rejects anything else", async () => {
      const user = await h.createUser({ name: "Link Lena" });
      const token = tokenFrom(mailsTo(user.email, /verify/i)[0]!.html, "verify-email")!;
      const [id, raw] = token.split(".") as [string, string];

      const flipped = raw.slice(0, -1) + (raw.endsWith("0") ? "1" : "0"); // always differs from the real token
      for (const bad of [`${id}.${"0".repeat(64)}`, `${id}.${flipped}`, `${"5f".repeat(12)}.${raw}`, "garbage", `${id}.`, ".abc"]) {
        const res = await h.api.post("/account/verify-email", { token: bad.length >= 10 ? bad : bad.padEnd(10, "x") });
        assert.equal(res.status, 400, `rejects ${bad.slice(0, 20)}`);
      }
      assert.equal((await h.api.post("/account/verify-email", {})).status, 422);

      const { User } = await h.load("../../src/models/User.model");
      assert.equal((await User.findById(user.id)).emailVerified, false);
      assert.equal((await h.api.post("/account/verify-email", { token })).status, 200);
      assert.equal((await User.findById(user.id)).emailVerified, true);
      assert.equal((await h.api.post("/account/verify-email", { token })).status, 200, "clicking twice is harmless");
    });

    it("rejects an expired link and lets the user request a fresh one, which supersedes the old", async () => {
      const user = await h.createUser({ name: "Late Lou" });
      const oldToken = tokenFrom(mailsTo(user.email, /verify/i)[0]!.html, "verify-email")!;
      const { User } = await h.load("../../src/models/User.model");
      await User.updateOne({ _id: user.id }, { $set: { "emailVerification.expiresAt": new Date(Date.now() - 1000) } });
      const expired = await h.api.post("/account/verify-email", { token: oldToken });
      assert.equal(expired.status, 400);
      assert.match(expired.body.message, /expired/i);

      const resent = await h.api.post("/account/resend-verification", undefined, { token: user.token });
      assert.equal(resent.status, 200);
      assert.equal(resent.body.data.alreadyVerified, false);
      await h.settle();
      const fresh = mailsTo(user.email, /verify/i).at(-1)!;
      const newToken = tokenFrom(fresh.html, "verify-email")!;
      assert.notEqual(newToken, oldToken);

      assert.equal((await h.api.post("/account/verify-email", { token: oldToken })).status, 400, "the superseded link is dead");
      assert.equal((await h.api.post("/account/verify-email", { token: newToken })).status, 200);
      assert.equal((await h.api.post("/account/resend-verification", undefined, { token: user.token })).body.data.alreadyVerified, true);
      assert.equal((await h.api.post("/account/resend-verification")).status, 401);
    });
  });

  describe("who gets notification emails", () => {
    it("never mails an unverified address (we don't know it's theirs), then does once verified", async () => {
      const receiver = await h.createUser({ name: "Unverified Uri", profile: true });
      const suitor = await h.createUser({ name: "Suitor Sal", profile: true });
      await h.makeMatch(suitor, receiver);
      assert.equal(mailsTo(receiver.email, /match/i).length, 0);

      const { User } = await h.load("../../src/models/User.model");
      await User.updateOne({ _id: receiver.id }, { $set: { emailVerified: true } });
      const [other] = await h.seedUsers(1, { profile: true });
      await h.makeMatch(other!, receiver);
      assert.equal(mailsTo(receiver.email, /match/i).length, 1);
    });

    it("includes a working one-click unsubscribe link and header on notification email", async () => {
      const a = await h.createUser({ name: "Alpha Ann", profile: true, verified: true });
      const b = await h.createUser({ name: "Beta Bo", profile: true, verified: true });
      await h.makeMatch(a, b);
      const mail = mailsTo(a.email, /match/i)[0]!;
      assert.ok(mail.html.includes("Unsubscribe"));
      assert.ok(tokenFrom(mail.html, "unsubscribe"));
      assert.match(mail.html, /you have match alerts turned on/);
    });

    it("respects the user's email preferences, per category", async () => {
      const a = await h.createUser({ name: "Prefs Pia", profile: true, verified: true });
      const b = await h.createUser({ name: "Prefs Bo", profile: true, verified: true });
      const saved = await h.api.put("/account/settings", { email: { matches: false } }, { token: a.token });
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.body.data.settings.email, { matches: false, messages: true, weeklyReport: true, referrals: true });

      await h.makeMatch(a, b);
      assert.equal(mailsTo(a.email, /match/i).length, 0, "opted out");
      assert.equal(mailsTo(b.email, /match/i).length, 1, "the other person still gets theirs");
      assert.equal((await h.api.get("/notifications", { token: a.token })).body.data.notifications.filter((n: { type: string }) => n.type === "match_created").length, 1, "in-app is independent of email");
    });

    it("can be switched off globally, while transactional email keeps flowing", async () => {
      await h.setFlag("email_notifications", false);
      const a = await h.createUser({ name: "Flag Fay", profile: true, verified: true });
      const b = await h.createUser({ name: "Flag Fin", profile: true, verified: true });
      await h.makeMatch(a, b);
      assert.equal(mailsTo(a.email, /match/i).length, 0);
      assert.equal(mailsTo(a.email, /welcome/i).length, 1, "welcome is transactional");
      assert.equal(mailsTo(a.email, /verify/i).length, 1, "so is verification");
      await h.setFlag("email_notifications", true);
    });

    it("skips suspended users", async () => {
      const a = await h.createUser({ name: "Banned Bea", profile: true, verified: true });
      const b = await h.createUser({ name: "Match Mo", profile: true, verified: true });
      await h.makeMatch(a, b);
      const before = h.outbox.filter((m) => m.to === a.email).length;
      await h.api.post(`/admin/users/${a.id}/suspend`, { reason: "Test" }, { token: admin.token });
      await h.settle();
      const c = await h.createUser({ name: "Third Tam", profile: true });
      await h.makeMatch(b, c);
      assert.equal(h.outbox.filter((m) => m.to === a.email && /match/i.test(m.subject)).length, 1, "no new match mail after suspension");
      assert.ok(h.outbox.filter((m) => m.to === a.email).length >= before);
    });
  });

  describe("unsubscribe", () => {
    let user: TestUser;
    let linkToken: string;

    before(async () => {
      user = await h.createUser({ name: "Unsub Una", profile: true, verified: true });
      const partner = await h.createUser({ name: "Unsub Partner", profile: true, verified: true });
      await h.makeMatch(user, partner);
      linkToken = tokenFrom(mailsTo(user.email, /match/i)[0]!.html, "unsubscribe")!;
    });

    it("works from the emailed link with no login, and only for that category", async () => {
      const res = await h.api.post("/account/unsubscribe", { token: linkToken });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.scope, "matches");
      assert.deepEqual((await settings(user)).email, { matches: false, messages: true, weeklyReport: true, referrals: true });
    });

    it("also accepts the token in the query string (mail clients' one-click POST)", async () => {
      const res = await fetch(`${h.baseUrl}/api/account/unsubscribe?token=${encodeURIComponent(linkToken)}`, { method: "POST" });
      assert.equal(res.status, 200);
    });

    it("can unsubscribe from everything", async () => {
      const { signUnsubscribeToken } = await h.load("../../src/services/email/email.service");
      const res = await h.api.post("/account/unsubscribe", { token: signUnsubscribeToken(user.id, "all") });
      assert.equal(res.body.data.scope, "all");
      assert.deepEqual((await settings(user)).email, { matches: false, messages: false, weeklyReport: false, referrals: false });
    });

    it("refuses forged, foreign and login tokens", async () => {
      assert.equal((await h.api.post("/account/unsubscribe", { token: "not-a-real-token" })).status, 400);
      assert.equal((await h.api.post("/account/unsubscribe", { token: user.token })).status, 400, "a login session can't be replayed as an unsubscribe");
      assert.equal((await h.api.post("/account/unsubscribe", {})).status, 422);
      const tampered = `${linkToken.slice(0, -3)}${linkToken.endsWith("abc") ? "xyz" : "abc"}`;
      assert.equal((await h.api.post("/account/unsubscribe", { token: tampered })).status, 400);
    });

    it("gives an unsubscribe token no power to act as a login", async () => {
      assert.equal((await h.api.get("/auth/me", { token: linkToken })).status, 401);
      assert.equal((await h.api.get("/notifications", { token: linkToken })).status, 401);
    });
  });

  describe("safety of content", () => {
    it("neutralises hostile display names in every email, and header injection in subjects", async () => {
      const evil = await h.createUser({ name: `<script>alert(1)</script> Mal`, profile: true, verified: true });
      const victim = await h.createUser({ name: "Victim Vic", profile: true, verified: true });
      const { matchId } = await h.makeMatch(evil, victim);
      const conversationId = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: victim.token })).body.data.conversation.id;
      await h.api.post("/messages/send", { conversationId, content: `<img src=x onerror=alert(1)> hi` }, { token: evil.token });
      await h.settle();

      const mails = h.outbox.filter((m) => m.to === victim.email || m.to === evil.email);
      assert.ok(mails.length >= 3);
      for (const mail of mails) {
        assert.ok(!mail.html.includes("<script"), `${mail.subject}: raw <script`);
        assert.ok(!mail.html.includes("<img src=x"), `${mail.subject}: raw <img`);
      }

      const { sendTemplateEmail } = await h.load("../../src/services/email/email.service");
      const outcome = await sendTemplateEmail({ email: "crlf@test.local" }, "new-message", { name: "X", senderName: "Eve\r\nBcc: attacker@evil.test", preview: "hi", count: 1 }, { category: "transactional" });
      assert.equal(outcome, "sent");
      const injected = h.outbox.find((m) => m.to === "crlf@test.local")!;
      assert.ok(!/[\r\n]/.test(injected.subject), "no line breaks in the subject");
      assert.ok(injected.subject.length <= 200);
    });
  });

  describe("provider failures", () => {
    it("never break the action that triggered them, and are logged for admins", async () => {
      const providers = await h.load("../../src/services/email/providers");
      const working = providers.getEmailProvider();
      providers.setEmailProviderForTests({ name: "resend", send: async () => { throw new Error("HTTP 503 upstream unavailable"); } });
      try {
        const email = `resilient.${Date.now()}@test.local`;
        const registered = await h.api.post("/auth/register", { fullName: "Resilient Rae", email, password: "Passw0rd!23" });
        assert.equal(registered.status, 201, "registration succeeds even though email is down");
        await h.settle();

        const failed = (await h.api.get("/admin/email-log?status=failed&limit=100", { token: admin.token })).body.data.entries.filter((e: { to: string }) => e.to === email);
        assert.deepEqual(failed.map((e: { template: string }) => e.template).sort(), ["verify-email", "welcome"]);
        assert.match(failed[0].error, /503/);
        assert.equal(failed[0].provider, "resend");
        assert.equal((await h.api.get("/admin/system", { token: admin.token })).body.data.emailFailuresLast24h >= 2, true);
      } finally {
        providers.setEmailProviderForTests(working);
      }
    });

    it("records the provider that actually delivered when a fallback took over", async () => {
      const providers = await h.load("../../src/services/email/providers");
      const working = providers.getEmailProvider();
      providers.setEmailProviderForTests({ name: "brevo", send: async () => ({ id: "fallback-1", provider: "resend" as const }) });
      try {
        const email = `fallback.${Date.now()}@test.local`;
        assert.equal((await h.api.post("/auth/register", { fullName: "Fallback Fay", email, password: "Passw0rd!23" })).status, 201);
        await h.settle();

        const sent = (await h.api.get("/admin/email-log?status=sent&limit=100", { token: admin.token })).body.data.entries.filter((e: { to: string }) => e.to === email);
        assert.ok(sent.length >= 2, "welcome + verification were delivered");
        assert.ok(sent.every((e: { provider: string }) => e.provider === "resend"), "logged against Resend, not the primary");
      } finally {
        providers.setEmailProviderForTests(working);
      }
    });

    it("lets the user retry verification once email is back", async () => {
      const email = `resilient.${Date.now()}b@test.local`;
      const providers = await h.load("../../src/services/email/providers");
      const working = providers.getEmailProvider();
      providers.setEmailProviderForTests({ name: "log", send: async () => { throw new Error("down"); } });
      await h.api.post("/auth/register", { fullName: "Retry Rue", email, password: "Passw0rd!23" });
      await h.settle();
      providers.setEmailProviderForTests(working);

      const login = await h.api.post("/auth/login", { email, password: "Passw0rd!23" });
      assert.equal((await h.api.post("/account/resend-verification", undefined, { token: login.body.data.token })).status, 200);
      await h.settle();
      assert.equal(mailsTo(email, /verify/i).length, 1);
    });
  });

  describe("weekly compatibility report", () => {
    it("goes to verified, opted-in members — once per ISO week", async () => {
      const [subscriber, optedOut, unverified] = [
        await h.createUser({ name: "Weekly Wes", profile: true, verified: true }),
        await h.createUser({ name: "Nope Nat", profile: true, verified: true }),
        await h.createUser({ name: "Unverified Ula", profile: true }),
      ];
      await h.api.put("/account/settings", { email: { weeklyReport: false } }, { token: optedOut.token });
      await h.completeInterview(subscriber);
      await h.seedUsers(2, { profile: true, aiProfile: true, prefix: "Candidate" });

      const { runWeeklyReports } = await h.load("../../src/services/weekly-report.service");
      const run = await runWeeklyReports({ force: true });
      assert.ok(run.sent >= 1 && run.failed === 0, JSON.stringify(run));

      const report = mailsTo(subscriber.email, /weekly compatibility/i);
      assert.equal(report.length, 1);
      assert.match(report[0]!.html, /Your top AI matches/);
      assert.match(report[0]!.html, /% compatible/);
      assert.ok(report[0]!.html.includes("Unsubscribe"));
      assert.equal(mailsTo(optedOut.email, /weekly compatibility/i).length, 0);
      assert.equal(mailsTo(unverified.email, /weekly compatibility/i).length, 0);

      const again = await runWeeklyReports({ force: true });
      assert.equal(again.sent, 0, "everyone already got this week's report");
      assert.equal(mailsTo(subscriber.email, /weekly compatibility/i).length, 1);
    });

    it("nudges people without an AI profile to take the interview", async () => {
      const newbie = await h.createUser({ name: "Newbie Nik", profile: true, verified: true });
      const { sendWeeklyReportTo } = await h.load("../../src/services/weekly-report.service");
      assert.equal(await sendWeeklyReportTo(newbie.id, "2030-W01"), "sent");
      assert.match(mailsTo(newbie.email, /weekly compatibility/i)[0]!.html, /haven't taken the AI interview/);
    });

    it("only runs inside its Monday window unless forced, and never when email is off", async () => {
      const { runWeeklyReports } = await h.load("../../src/services/weekly-report.service");
      assert.deepEqual(await runWeeklyReports({ now: new Date("2031-03-04T10:00:00Z") }), { skipped: "outside_window" }, "a Tuesday");
      assert.deepEqual(await runWeeklyReports({ now: new Date("2031-03-03T07:00:00Z") }), { skipped: "outside_window" }, "Monday before 08:00");
      const monday = await runWeeklyReports({ now: new Date("2031-03-03T09:00:00Z") });
      assert.equal(monday.week, "2031-W10");

      await h.setFlag("email_notifications", false);
      assert.deepEqual(await runWeeklyReports({ force: true }), { skipped: "email_disabled" });
      await h.setFlag("email_notifications", true);
    });

    it("can be run on demand from the admin job runner", async () => {
      const res = await h.api.post("/admin/jobs/weekly-report/run?force=true", undefined, { token: admin.token });
      assert.equal(res.status, 200);
    });
  });
});
