import type { Metadata } from "next";
import Link from "next/link";

import { LegalList, LegalPage, LegalSection } from "@/components/legal/legal-page";
import { SUPPORT_EMAIL } from "@/lib/data";

export const metadata: Metadata = {
  title: "Terms of Service",
  alternates: { canonical: "/terms" },
  description: "The terms you agree to by creating a SoulSync account: what's expected of you, how Premium billing works, and how accounts can be suspended or removed.",
};

const UPDATED = "27 September 2026";

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      updated={UPDATED}
      intro={<p>By creating a SoulSync account, you agree to these terms. Please also read our{" "}
        <Link href="/privacy" className="text-accent underline underline-offset-2 hover:text-accent/80">Privacy Policy</Link> and{" "}
        <Link href="/safety" className="text-accent underline underline-offset-2 hover:text-accent/80">Safety Guidelines</Link>.</p>}
    >
      <LegalSection title="1. Who can use SoulSync">
        <LegalList
          items={[
            "You must be at least 18 years old.",
            "You must provide accurate information and use your own identity — no impersonating someone else, and no fake or duplicate accounts.",
            "You're responsible for keeping your password secure, and for what happens under your account.",
          ]}
        />
      </LegalSection>

      <LegalSection title="2. How the AI features work">
        <p>
          Your interview answers are analyzed by an AI service to write your personality report and to explain why you and another
          member were matched. Matching itself is done by a fixed scoring formula, not by the AI — see{" "}
          <Link href="/how-our-ai-works" className="text-accent underline underline-offset-2 hover:text-accent/80">
            How our AI works
          </Link>{" "}
          for the full breakdown. AI-generated text can be wrong or read oddly; it&apos;s a description, not a guarantee about
          another person.
        </p>
      </LegalSection>

      <LegalSection title="3. Your conduct">
        <p>You agree not to:</p>
        <LegalList
          items={[
            "Harass, threaten, or abuse another member.",
            "Send unsolicited commercial content, scam attempts, or solicit money or financial details from anyone.",
            "Upload a photo that isn't of you, or that contains nudity or illegal content.",
            "Scrape, reverse-engineer, or use the service to build a competing product.",
            "Attempt to bypass rate limits, security controls, or the email-verification requirement.",
          ]}
        />
        <p>
          See{" "}
          <Link href="/safety" className="text-accent underline underline-offset-2 hover:text-accent/80">
            Safety Guidelines
          </Link>{" "}
          for what to do if someone breaks these rules, and how reports are handled.
        </p>
      </LegalSection>

      <LegalSection title="4. Premium plans and billing">
        <LegalList
          items={[
            "Premium plans renew automatically at the price and interval you chose, until you cancel.",
            "Canceling stops future renewal — you keep Premium access until the end of the period you already paid for.",
            "We don't offer prorated refunds for the unused part of a billing period. If something went wrong with a charge, contact us and we'll look into it.",
            "Payments are processed by Stripe or Razorpay; we never see or store your full card details.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Suspension and termination">
        <p>
          We can suspend or remove an account that breaks these terms, poses a safety risk to other members, or is inactive and
          unverified for an extended period. You can delete your own account at any time from Settings.
        </p>
      </LegalSection>

      <LegalSection title="6. No warranty">
        <p>
          SoulSync is provided &quot;as is.&quot; We work to keep it accurate and available, but we don&apos;t guarantee it will be
          error-free, uninterrupted, or that any match or AI-generated description will be correct. We aren&apos;t responsible for
          the conduct of other members, on or off the platform.
        </p>
      </LegalSection>

      <LegalSection title="7. Changes to these terms">
        <p>If we make a meaningful change to these terms, we&apos;ll update the date at the top of this page.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these terms:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline underline-offset-2 hover:text-accent/80">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
