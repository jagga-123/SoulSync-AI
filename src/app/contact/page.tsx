import type { Metadata } from "next";
import Link from "next/link";
import { Code2, Mail, ShieldAlert } from "lucide-react";

import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { SOURCE_CODE_URL, SUPPORT_EMAIL } from "@/lib/data";

export const metadata: Metadata = {
  title: "Contact",
  alternates: { canonical: "/contact" },
  description: "How to reach SoulSync — support, safety reports, and the source code.",
};

const CHANNELS = [
  {
    icon: Mail,
    title: "General support",
    body: "Account issues, billing questions, feedback, or anything else.",
    href: `mailto:${SUPPORT_EMAIL}`,
    label: SUPPORT_EMAIL,
  },
  {
    icon: ShieldAlert,
    title: "Report a safety concern",
    body: "For another member's behavior, use Report on their profile or in your conversation with them — it reaches our moderation queue directly and fastest. For anything urgent, email us.",
    href: `mailto:${SUPPORT_EMAIL}`,
    label: SUPPORT_EMAIL,
  },
  {
    icon: Code2,
    title: "Found a bug or security issue in the code",
    body: "SoulSync is open source. File an issue, or reach out directly for anything sensitive.",
    href: SOURCE_CODE_URL,
    label: "View the repository",
  },
];

export default function ContactPage() {
  return (
    <LegalPage eyebrow="Support" title="Contact us" updated="27 September 2026" intro={<p>Pick whichever fits best — we read everything that comes to {SUPPORT_EMAIL}.</p>}>
      <div className="mt-8 grid gap-4 sm:grid-cols-1">
        {CHANNELS.map((channel) => (
          <a
            key={channel.title}
            href={channel.href}
            target={channel.href.startsWith("http") ? "_blank" : undefined}
            rel={channel.href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 outline-none transition-colors hover:border-white/20 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-accent ring-1 ring-white/10">
              <channel.icon className="size-[18px]" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-lg font-semibold text-white">{channel.title}</span>
              <span className="mt-1 block text-sm leading-relaxed text-white/70">{channel.body}</span>
              <span className="mt-2 block text-sm font-medium text-accent group-hover:underline">{channel.label}</span>
            </span>
          </a>
        ))}
      </div>

      <LegalSection title="Response time">
        <p>We&apos;re a small team — expect a reply within a few days. Safety reports filed in-app are reviewed fastest.</p>
      </LegalSection>

      <LegalSection title="Before you write in">
        <p>
          Some answers are already written down:{" "}
          <Link href="/how-our-ai-works" className="text-accent underline underline-offset-2 hover:text-accent/80">
            How our AI works
          </Link>
          ,{" "}
          <Link href="/pricing" className="text-accent underline underline-offset-2 hover:text-accent/80">
            Pricing
          </Link>
          ,{" "}
          <Link href="/privacy" className="text-accent underline underline-offset-2 hover:text-accent/80">
            Privacy Policy
          </Link>
          ,{" "}
          <Link href="/terms" className="text-accent underline underline-offset-2 hover:text-accent/80">
            Terms of Service
          </Link>
          , and{" "}
          <Link href="/safety" className="text-accent underline underline-offset-2 hover:text-accent/80">
            Safety Guidelines
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
