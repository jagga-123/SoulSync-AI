import "../helpers/setup-env";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEMPLATES, escapeHtml, renderTemplate, type TemplateData, type TemplateName } from "../../src/services/email/templates";
import { parseAddress } from "../../src/services/email/providers";

const HOSTILE = `<script>alert("x")</script> & <img src=x onerror=alert(1)>`;

const SAMPLE: { [K in TemplateName]: TemplateData[K] } = {
  welcome: { name: "Ada Lovelace" },
  "verify-email": { name: "Ada Lovelace", verifyUrl: "http://localhost:3000/verify-email?token=abc.def" },
  match: { name: "Ada Lovelace", matchName: "Grace Hopper", score: 91 },
  "new-message": { name: "Ada Lovelace", senderName: "Grace Hopper", preview: "See you at 8?", count: 1 },
  "weekly-report": {
    name: "Ada Lovelace", hasAIProfile: true, stats: { newLikes: 3, newMatches: 1, unreadMessages: 2 },
    recommendations: [{ name: "Grace Hopper", score: 88, reason: "You both value honesty" }],
  },
  invite: { inviterName: "Ada Lovelace", inviteUrl: "http://localhost:3000/register?ref=ABCDEFGH" },
  "waitlist-confirmation": { position: 42 },
  "waitlist-invite": { inviteUrl: "http://localhost:3000/register?invite=abc" },
  "subscription-started": { name: "Ada Lovelace", planName: "Premium", expiry: "October 19, 2026" },
  "subscription-canceled": { name: "Ada Lovelace", planName: "Premium", expiry: "October 19, 2026" },
  "account-suspended": { name: "Ada Lovelace", reason: "Harassment" },
};

/** The same data with every user-controlled string replaced by hostile markup. */
const HOSTILE_DATA: { [K in TemplateName]: TemplateData[K] } = {
  welcome: { name: HOSTILE },
  "verify-email": { name: HOSTILE, verifyUrl: `http://localhost:3000/verify-email?token="><script>x</script>` },
  match: { name: HOSTILE, matchName: HOSTILE, score: 90 },
  "new-message": { name: HOSTILE, senderName: HOSTILE, preview: HOSTILE, count: 2 },
  "weekly-report": {
    name: HOSTILE, hasAIProfile: true, stats: { newLikes: 1, newMatches: 1, unreadMessages: 1 },
    recommendations: [{ name: HOSTILE, score: 80, reason: HOSTILE }],
  },
  invite: { inviterName: HOSTILE, inviteUrl: `http://localhost:3000/register?ref="><script>x</script>` },
  "waitlist-confirmation": { position: 1 },
  "waitlist-invite": { inviteUrl: `http://x/"><script>x</script>` },
  "subscription-started": { name: HOSTILE, planName: HOSTILE, expiry: HOSTILE },
  "subscription-canceled": { name: HOSTILE, planName: HOSTILE, expiry: HOSTILE },
  "account-suspended": { name: HOSTILE, reason: HOSTILE },
};

const names = Object.keys(TEMPLATES) as TemplateName[];
const render = <K extends TemplateName>(name: K, data: TemplateData[K], unsub?: string) => renderTemplate(name, data, unsub);

describe("email templates", () => {
  it("has a template for every kind of email the platform sends", () => {
    assert.deepEqual([...names].sort(), [
      "account-suspended", "invite", "match", "new-message", "subscription-canceled", "subscription-started",
      "verify-email", "waitlist-confirmation", "waitlist-invite", "weekly-report", "welcome",
    ]);
  });

  for (const name of names) {
    it(`"${name}" renders a subject, an HTML body and a plain-text alternative`, () => {
      const email = render(name, SAMPLE[name] as never);
      assert.ok(email.subject.length > 3 && !/[\r\n]/.test(email.subject));
      assert.match(email.html, /^<!doctype html>/i);
      assert.match(email.html, /<\/html>\s*$/);
      assert.ok(email.text.length > 20, "plain text present");
      assert.ok(!email.text.includes("<"), "plain text has no markup");
      assert.ok(email.html.includes("SoulSync AI"));
    });

    it(`"${name}" can never inject markup through user-supplied data`, () => {
      const email = render(name, HOSTILE_DATA[name] as never);
      assert.ok(!email.html.includes("<script"), `raw <script in ${name}`);
      assert.ok(!email.html.includes("<img src=x"), `raw <img in ${name}`);
      assert.ok(!/onerror=alert\(1\)>/.test(email.html.replace(/&lt;img src=x onerror=alert\(1\)&gt;/g, "")), `unescaped handler in ${name}`);
      assert.ok(!/"><script/.test(email.html), "attribute breakout");
    });
  }

  it("escapes the five HTML-significant characters", () => {
    assert.equal(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
    assert.equal(escapeHtml("plain"), "plain");
    assert.equal(escapeHtml("&amp;"), "&amp;amp;", "no double-decoding surprises");
  });

  it("addresses people by first name only", () => {
    assert.match(render("welcome", { name: "Ada Augusta Lovelace" }).html, /Welcome, Ada</);
    assert.match(render("welcome", { name: "   " }).html, /Welcome, there</);
  });

  it("includes an unsubscribe link on notification emails only when one is supplied", () => {
    const url = "http://localhost:3000/unsubscribe?token=t";
    assert.ok(render("match", SAMPLE.match, url).html.includes(`href="${url}"`));
    assert.ok(!render("match", SAMPLE.match).html.includes("Unsubscribe"));
    for (const transactional of ["welcome", "verify-email", "waitlist-invite", "account-suspended"] as const) {
      assert.ok(!render(transactional, SAMPLE[transactional] as never).html.includes("Unsubscribe"), transactional);
    }
  });

  it("puts the call-to-action URL in both the HTML and plain-text versions", () => {
    const verify = render("verify-email", SAMPLE["verify-email"]);
    assert.ok(verify.html.includes('href="http://localhost:3000/verify-email?token=abc.def"'));
    assert.ok(verify.text.includes("http://localhost:3000/verify-email?token=abc.def"));
    const invite = render("invite", SAMPLE.invite);
    assert.ok(invite.text.includes("ref=ABCDEFGH"));
  });

  it("varies message emails by count", () => {
    assert.equal(render("new-message", { ...SAMPLE["new-message"], count: 1 }).subject, "New message from Grace Hopper");
    assert.equal(render("new-message", { ...SAMPLE["new-message"], count: 4 }).subject, "4 new messages from Grace Hopper");
  });

  it("handles both weekly-report shapes: with and without an AI profile or recommendations", () => {
    const withRecs = render("weekly-report", SAMPLE["weekly-report"]);
    assert.match(withRecs.html, /88% compatible/);
    assert.match(withRecs.text, /Grace Hopper \(88%\)/);

    const noRecs = render("weekly-report", { ...SAMPLE["weekly-report"], recommendations: [] } as never);
    assert.match(noRecs.html, /No new recommendations this week/);

    const noProfile = render("weekly-report", { name: "Ada", hasAIProfile: false, stats: { newLikes: 0, newMatches: 0, unreadMessages: 0 }, recommendations: [] });
    assert.match(noProfile.html, /haven't taken the AI interview/);
    assert.match(noProfile.text, /ai-interview/);
  });

  it("only shows an AI score in the match email when there is one", () => {
    assert.match(render("match", SAMPLE.match).html, /91%/);
    assert.doesNotMatch(render("match", { name: "Ada", matchName: "Grace" }).html, /compatibility is/);
  });
});

describe("parseAddress", () => {
  it("splits a display name from the address", () => {
    assert.deepEqual(parseAddress("SoulSync AI <hello@example.test>"), { name: "SoulSync AI", email: "hello@example.test" });
    assert.deepEqual(parseAddress('"Quoted Name" <a@b.co>'), { name: "Quoted Name", email: "a@b.co" });
  });
  it("accepts a bare address", () => {
    assert.deepEqual(parseAddress("  a@b.co "), { email: "a@b.co" });
    assert.deepEqual(parseAddress("<a@b.co>"), { name: undefined, email: "a@b.co" });
  });
});
