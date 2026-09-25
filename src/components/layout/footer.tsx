import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/** Only real destinations — a link goes here when the page behind it exists. */
const FOOTER_LINKS = {
  Product: [
    { label: "How it works", href: "/#how-it-works" },
    { label: "Why it works", href: "/#matchmaking" },
    { label: "How our AI works", href: "/how-our-ai-works" },
    { label: "FAQ", href: "/#faq" },
    { label: "Pricing", href: "/pricing" },
  ],
  Account: [
    { label: "Sign in", href: "/login" },
    { label: "Create account", href: "/register" },
    { label: "Settings", href: "/settings" },
  ],
};

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/10 bg-background/60">
      <div className="mx-auto max-w-8xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          <div className="col-span-2">
            <Link href="/" aria-label="SoulSync home" className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Logo />
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
              Conversation-first dating. SoulSync uses AI to suggest matches and to explain why — AI can be
              wrong, so you always decide who to talk to.
            </p>
          </div>

          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title} className="col-span-1">
              <h3 className="font-display text-sm font-semibold text-white">{title}</h3>
              <ul className="mt-4 space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-white/70 transition-colors hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-xs text-white/60">&copy; {new Date().getFullYear()} SoulSync. All rights reserved.</p>
          <p className="text-xs text-white/60">Free to join · About 10 minutes to set up</p>
        </div>
      </div>
    </footer>
  );
}
