import "../helpers/setup-env";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appUrl } from "../../src/config/env";
import { renderTemplate, TEMPLATES, type TemplateData, type TemplateName } from "../../src/services/email/templates";

// Realistic data for every template — rendered by the real renderer, no database.
const SAMPLE: { [K in TemplateName]: TemplateData[K] } = {
  welcome: { name: "Asha Verma" },
  "verify-email": { name: "Asha Verma", verifyUrl: `${appUrl}/verify-email?token=0123456789abcdef01234567.${"ab".repeat(32)}` },
  match: { name: "Asha Verma", matchName: "Ravi Kumar", score: 91 },
  "new-message": { name: "Asha Verma", senderName: "Ravi Kumar", preview: "Hey Asha, how was your weekend hike?", count: 2 },
  "weekly-report": { name: "Asha Verma", hasAIProfile: true, stats: { newLikes: 3, newMatches: 1, unreadMessages: 2 }, recommendations: [{ name: "Ravi", score: 91, reason: "You both value honesty and outdoor adventures." }] },
  invite: { inviterName: "Asha Verma", inviteUrl: `${appUrl}/register?ref=ABC123` },
  "waitlist-confirmation": { position: 42 },
  "waitlist-invite": { inviteUrl: `${appUrl}/register?invite=xyz` },
  "subscription-started": { name: "Asha Verma", planName: "Premium", expiry: "20 Oct 2026" },
  "subscription-canceled": { name: "Asha Verma", planName: "Premium", expiry: "20 Oct 2026" },
  "account-suspended": { name: "Asha Verma", reason: "Repeated reports from other members" },
};
const NOTIFICATION: TemplateName[] = ["match", "new-message", "weekly-report"];
const names = Object.keys(TEMPLATES) as TemplateName[];
const render = (name: TemplateName) => renderTemplate(name, SAMPLE[name] as never, NOTIFICATION.includes(name) ? `${appUrl}/unsubscribe?token=sample` : undefined);

describe("email deliverability: every template", () => {
  it("has data for every template (so a new template can't skip this audit)", () => {
    assert.deepEqual(Object.keys(SAMPLE).sort(), [...names].sort());
  });

  for (const name of names) {
    describe(name, () => {
      const { subject, html, text } = render(name);

      it("ships both an HTML and a plain-text version", () => {
        assert.ok(html.length > 200 && text.trim().length > 20);
      });

      it("renders on a phone: viewport meta and a fluid table layout no wider than 560px", () => {
        assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
        assert.match(html, /<table role="presentation" width="100%"[^>]*max-width:560px/);
        assert.match(html, /<html lang="en">/);
      });

      it("stays far below Gmail's ~102 KB clipping limit, and has no scripts", () => {
        assert.ok(Buffer.byteLength(html) < 40_000, `${Buffer.byteLength(html)} bytes`);
        assert.ok(!/<script/i.test(html));
      });

      it("has a short subject and only absolute links", () => {
        assert.ok(subject.length > 0 && subject.length <= 78, `subject is ${subject.length} chars`);
        const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
        // (waitlist-confirmation and account-suspended are informational and legitimately have no link)
        for (const link of links) assert.match(link, /^https?:\/\//, link);
      });

      it("carries an unsubscribe link exactly when it is a notification email", () => {
        assert.equal(/Unsubscribe<\/a>/.test(html), NOTIFICATION.includes(name));
      });
    });
  }

  it("the verification email's plain-text version contains the same link as the button", () => {
    const { html, text } = render("verify-email");
    const button = /href="([^"]*verify-email\?token=[^"]+)"/.exec(html)![1]!;
    assert.ok(text.includes(button));
    assert.match(button, /^https?:\/\/.+\/verify-email\?token=[0-9a-f]{24}\.[0-9a-f]{64}$/);
  });

  it("never lets a hostile display name reach an inbox as markup", () => {
    const { html } = renderTemplate("welcome", { name: '<img src=x onerror=alert(1)> "Eve"' });
    assert.ok(!html.includes("<img src=x"));
  });
});
