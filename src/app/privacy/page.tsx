import type { Metadata } from "next";
import Link from "next/link";

import { LegalList, LegalPage, LegalSection } from "@/components/legal/legal-page";
import { SUPPORT_EMAIL } from "@/lib/data";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "/privacy" },
  description: "What SoulSync collects, why, who it's shared with, and how to control or delete your data.",
};

const UPDATED = "27 September 2026";

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      updated={UPDATED}
      intro={<p>This describes what SoulSync (&quot;we&quot;) collects about you, why, who it&apos;s shared with, and how you can control or delete it.</p>}
    >
      <LegalSection title="1. What we collect">
        <p>Directly from you:</p>
        <LegalList
          items={[
            "Account details: full name, email address, password (stored as a bcrypt hash — we never store or see your plain-text password).",
            "Profile details: age, gender, city, bio, interests, relationship goal, and an optional profile photo.",
            "Your AI interview answers, so we can write your personality report and explain your matches.",
            "Messages you send to other members, and reports you file against them.",
            "Payment details when you upgrade — handled entirely by our payment processor (Stripe or Razorpay, depending on your region). We never see or store your card details.",
          ]}
        />
        <p>Automatically:</p>
        <LegalList
          items={[
            "Basic technical data needed to run the service and keep it safe: IP address (for rate-limiting and abuse prevention), timestamps of activity, and error reports if something breaks.",
            "A session token stored in your browser's local storage, so you stay signed in. We don't use tracking or advertising cookies.",
          ]}
        />
      </LegalSection>

      <LegalSection title="2. Why we collect it">
        <LegalList
          items={[
            "To run the core product: create your profile, run the AI interview, work out and explain matches, and deliver messages.",
            "To keep the platform safe: reviewing reports, blocking abusive accounts, and rate-limiting to stop spam and account takeover attempts.",
            "To send account and safety email — verification, password reset, match and message notifications, receipts. You can turn optional notification email off in Settings; security email (like a password-change confirmation) always sends.",
            "To process payments for Premium plans, if you choose to upgrade.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Your photo">
        <p>
          Every photo you upload is decoded and re-encoded on our server before it&apos;s stored or shown to anyone — this strips all
          embedded metadata, including GPS location, from the file. Photos are stored either on our own server or on Cloudinary,
          depending on how this instance is configured; either way, the same processing happens first.
        </p>
      </LegalSection>

      <LegalSection title="4. Who we share it with">
        <p>We don&apos;t sell your data. It&apos;s shared only with the outside services that make the product work:</p>
        <LegalList
          items={[
            "AI providers (Groq, Google Gemini, OpenAI, or Anthropic, depending on configuration) — your interview answers are sent to generate your report and match explanations.",
            "Our email provider (Brevo, or an SMTP relay) — to deliver the emails described above.",
            "Our payment processor (Stripe or Razorpay) — to process a Premium upgrade.",
            "Cloudinary — if this instance stores photos there instead of on our own server.",
            "An error-tracking service, if one is configured — to catch and fix bugs. Error reports never include message content or passwords.",
          ]}
        />
        <p>Other members only ever see your public profile (name, age, city, photo, bio, interests) and what you have in common with them — never your interview answers or full report.</p>
      </LegalSection>

      <LegalSection title="5. How long we keep it">
        <p>
          We keep your account and its data for as long as your account exists. Payment records are the one exception: we keep those
          (identified only by an internal account id, not your name) after an account is deleted, for accounting and tax purposes.
        </p>
      </LegalSection>

      <LegalSection title="6. Your controls">
        <p>From Settings, at any time:</p>
        <LegalList
          items={[
            "Change your password, or sign out of every device at once.",
            "Turn off optional notification and marketing-style email, category by category.",
            "Block or unblock another member, or report a conversation.",
            <>
              Delete your account permanently — this removes your profile, matches, conversations, messages, likes, and photo. See{" "}
              <Link href="/terms" className="text-accent underline underline-offset-2 hover:text-accent/80">
                Terms
              </Link>{" "}
              for what this doesn&apos;t undo.
            </>,
          ]}
        />
        <p>
          Want a copy of your data, or have a question about what we hold? Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline underline-offset-2 hover:text-accent/80">
            {SUPPORT_EMAIL}
          </a>{" "}
          and we&apos;ll help.
        </p>
      </LegalSection>

      <LegalSection title="7. Age">
        <p>SoulSync is for adults. You must be at least 18 years old to create an account, and we don&apos;t knowingly collect data from anyone younger.</p>
      </LegalSection>

      <LegalSection title="8. Changes to this policy">
        <p>If this policy changes in a meaningful way, we&apos;ll update the date at the top of this page.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about this policy or your data:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline underline-offset-2 hover:text-accent/80">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
