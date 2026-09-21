import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startHarness, type CapturedEmail, type Harness, type TestUser } from "../helpers/harness";

const FROM = "SoulSync AI <hello@soulsync.test>";
const REPLY_TO = "SoulSync Support <support@soulsync.test>";
const API_PUBLIC_URL = "https://api.soulsync.test/api";

/**
 * Drives the REAL application through every flow that sends email and inspects what would go out: the
 * verification, welcome, match, new-message, weekly-report, referral-invite and billing emails. Only the
 * transport at the very end is swapped for a capture, so what is asserted here is exactly what Brevo receives.
 */
describe("every email the app sends, through the real flows", () => {
  let h: Harness;
  let admin: TestUser;
  let ada: TestUser;
  let ben: TestUser;

  before(async () => {
    h = await startHarness({ env: { EMAIL_FROM: FROM, EMAIL_REPLY_TO: REPLY_TO, API_PUBLIC_URL } });
    admin = await h.makeAdmin(await h.createUser({ name: "Templates Admin" }));
    await h.setFlag("billing", true);

    ada = await h.createUser({ name: "Ada Lovelace", profile: true, verified: true });
    ben = await h.createUser({ name: "Ben Franklin", profile: true, verified: true });
    const { matchId } = await h.makeMatch(ada, ben);
    const conversationId = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: ada.token })).body.data.conversation.id;
    await h.api.post("/messages/send", { conversationId, content: "Hello Ben, lovely to match with you!" }, { token: ada.token });

    const { runWeeklyReports } = await h.load("../../src/services/weekly-report.service");
    await runWeeklyReports({ force: true });

    await h.api.post("/growth/referrals/invite", { emails: ["friend@test.local"] }, { token: ada.token });

    const started = await h.api.post("/billing/checkout", { plan: "premium", interval: "monthly" }, { token: ada.token });
    await h.api.post("/billing/mock/complete", { session: new URL(started.body.data.url).searchParams.get("session") }, { token: ada.token });
    await h.api.post("/billing/cancel", undefined, { token: ada.token });
    await h.settle();
  });
  after(() => h.stop());

  const to = (email: string, pattern: RegExp) => h.outbox.filter((m) => m.to === email && pattern.test(m.subject));
  const only = (mails: CapturedEmail[]) => {
    assert.equal(mails.length, 1, `expected exactly one email, got ${mails.map((m) => m.subject).join(" | ") || "none"}`);
    return mails[0]!;
  };

  describe("the seven emails", () => {
    const cases: Array<[string, () => CapturedEmail, RegExp, boolean]> = [
      ["verification", () => only(to(ada.email, /verify your email/i)), /verify-email\?token=[0-9a-f]{24}\.[0-9a-f]{64}/, false],
      ["welcome", () => only(to(ada.email, /^welcome to soulsync/i)), /Get started/, false],
      ["match notification", () => only(to(ada.email, /match with Ben/i)), /Start the conversation/, true],
      ["new-message notification", () => only(to(ben.email, /new message from Ada/i)), /Hello Ben/, true],
      ["weekly report", () => only(to(ada.email, /week/i)), /weekly|AI interview/i, true],
      ["referral invite", () => only(to("friend@test.local", /./)), /register\?ref=/, false],
      ["billing confirmation (receipt)", () => only(to(ada.email, /your premium plan is active|premium/i).filter((m) => !/cancel|end/i.test(m.subject))), /Premium/, false],
      ["billing cancellation", () => only(to(ada.email, /will end/i)), /Premium/, false],
    ];

    for (const [label, find, contentPattern, isNotification] of cases) {
      it(`${label}: HTML + plain text, one sender identity, Reply-To, and the right headers`, () => {
        const mail = find();
        assert.equal(mail.from, FROM, "every email goes out under the same From");
        assert.equal((mail as CapturedEmail & { replyTo?: string }).replyTo, REPLY_TO);
        assert.ok(mail.html.length > 200 && mail.text.length > 20, "both versions present");
        assert.match(mail.html, contentPattern);
        assert.match(mail.html, /<meta name="viewport"/);
        if (isNotification) {
          assert.match(mail.headers?.["List-Unsubscribe"] ?? "", /^<https:\/\/api\.soulsync\.test\/api\/account\/unsubscribe\?token=[^>]+>$/);
          assert.equal(mail.headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
          assert.match(mail.html, /Unsubscribe<\/a>/);
        } else {
          assert.equal(mail.headers?.["List-Unsubscribe"], undefined, "transactional mail carries no unsubscribe header");
        }
      });
    }
  });

  it("nothing in the whole run was sent from a different address or without Reply-To", () => {
    assert.ok(h.outbox.length >= 10, `only ${h.outbox.length} emails were captured`);
    for (const mail of h.outbox) {
      assert.equal(mail.from, FROM, `${mail.subject} → ${mail.from}`);
      assert.equal((mail as CapturedEmail & { replyTo?: string }).replyTo, REPLY_TO, mail.subject);
    }
  });

  it("the one-click unsubscribe URL in the header really works, with a plain POST and no login", async () => {
    const mail = only(to(ben.email, /new message from Ada/i));
    const url = /<([^>]+)>/.exec(mail.headers!["List-Unsubscribe"]!)![1]!;
    const token = new URL(url).searchParams.get("token")!;
    const res = await h.api.post(`/account/unsubscribe?token=${encodeURIComponent(token)}`, undefined, { raw: "List-Unsubscribe=One-Click", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await h.api.get("/account/settings", { token: ben.token })).body.data.settings.email.messages, false);
  });

  it("the token in the verification link verifies the account and lands on a page that exists", async () => {
    const user = await h.createUser({ name: "Link Lena" });
    const mail = only(to(user.email, /verify your email/i));
    const link = /href="([^"]*verify-email\?token=[^"]+)"/.exec(mail.html)![1]!;
    assert.match(link, /^http:\/\/localhost:3000\/verify-email\?token=/, "the link points at the frontend's /verify-email page");
    const token = new URL(link).searchParams.get("token")!;
    assert.equal((await h.api.post("/account/verify-email", { token })).status, 200);
    assert.equal((await h.api.get("/auth/me", { token: user.token })).body.data.user.emailVerified, true);
    assert.equal((await h.api.post("/account/verify-email", { token })).status, 200, "clicking twice is harmless");
    void admin;
  });
});
