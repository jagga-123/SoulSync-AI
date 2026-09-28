import type { Metadata } from "next";

import { LegalList, LegalPage, LegalSection } from "@/components/legal/legal-page";
import { SUPPORT_EMAIL } from "@/lib/data";

export const metadata: Metadata = {
  title: "Safety Guidelines",
  alternates: { canonical: "/safety" },
  description: "How to block and report on SoulSync, what happens after a report, and general advice for meeting people from the app safely.",
};

const UPDATED = "27 September 2026";

export default function SafetyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Safety Guidelines"
      updated={UPDATED}
      intro={<p>Meeting people online carries real risks. Here&apos;s what SoulSync does to help, what you can do yourself, and how to reach us if something goes wrong.</p>}
    >
      <LegalSection title="Before you meet anyone">
        <LegalList
          items={[
            "Keep chatting on SoulSync until you're comfortable — you don't owe anyone your phone number, socials, or address.",
            "Video call before meeting in person, if you can.",
            "Meet the first time in a public place, and tell a friend or family member where you're going and who with.",
            "Arrange your own way there and back — don't get picked up from home on a first meeting.",
            "Never send money, gift cards, or financial details to someone you've matched with, however convincing their story is. This is one of the most common online-dating scams.",
            "Trust your instincts. If something feels off, it's fine to stop replying — you don't need a reason.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Blocking someone">
        <p>
          Blocking is immediate and works both ways: a blocked member can&apos;t see your profile, message you, or show up in your
          Discover feed, and you won&apos;t see theirs. You can block from their profile or from a conversation, and unblock later
          from Settings → Blocked people if you change your mind.
        </p>
      </LegalSection>

      <LegalSection title="Reporting someone">
        <p>You can report a member from their profile or a conversation, with one of these reasons:</p>
        <LegalList
          items={[
            "Spam",
            "Harassment",
            "Fake profile",
            "Inappropriate content",
            "Underage user",
            "Scam or financial fraud attempt",
            "Something else",
          ]}
        />
        <p>
          A report goes straight to our moderation queue with the context needed to review it (including the message you flagged,
          if it came from a conversation). We review every report; action can include a warning, suspension, or permanent removal of
          the account, depending on what happened. We don&apos;t share your identity with the person you reported.
        </p>
      </LegalSection>

      <LegalSection title="If you're in immediate danger">
        <p>
          Contact your local emergency services first. SoulSync&apos;s report and block tools address behavior on the platform — they
          are not a substitute for emergency help.
        </p>
      </LegalSection>

      <LegalSection title="Report something to us directly">
        <p>
          For anything urgent, or a pattern of behavior you want a human to look at, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline underline-offset-2 hover:text-accent/80">
            {SUPPORT_EMAIL}
          </a>{" "}
          with as much detail as you can — the other person&apos;s name on the app, and what happened.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
