import { Heart } from "lucide-react";
import type { SVGProps } from "react";

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M4 4l7.5 8.5L4.5 20h2.2l6-6.7 4.8 6.7H20l-7.8-8.9L19.2 4H17l-5.6 6.2L7 4H4z"
        fill="currentColor"
      />
    </svg>
  );
}

function LinkedinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.5 10v6.5M7.5 7.5v.01M12 16.5V13c0-1.4.9-2.3 2.1-2.3 1.2 0 1.9.9 1.9 2.3v3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function YoutubeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3" y="6" width="18" height="12" rx="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 9.5l5 2.5-5 2.5v-5z" fill="currentColor" />
    </svg>
  );
}

const FOOTER_LINKS = {
  Product: [
    { label: "How it works", href: "#how-it-works" },
    { label: "AI Matchmaking", href: "#matchmaking" },
    { label: "Features", href: "#features" },
    { label: "Success stories", href: "#testimonials" },
  ],
  Company: [
    { label: "About us", href: "#" },
    { label: "Careers", href: "#" },
    { label: "Press", href: "#" },
    { label: "Blog", href: "#" },
  ],
  Legal: [
    { label: "Privacy policy", href: "#" },
    { label: "Terms of service", href: "#" },
    { label: "Safety center", href: "#" },
    { label: "Cookie preferences", href: "#" },
  ],
};

const SOCIALS = [
  { icon: InstagramIcon, label: "Instagram", href: "#" },
  { icon: XIcon, label: "X (Twitter)", href: "#" },
  { icon: LinkedinIcon, label: "LinkedIn", href: "#" },
  { icon: YoutubeIcon, label: "YouTube", href: "#" },
];

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/10 bg-background/60">
      <div className="mx-auto max-w-8xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-6">
          <div className="col-span-2 md:col-span-2">
            <a href="#top" className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-brand">
                <Heart className="size-4 fill-white text-white" />
              </span>
              <span className="font-display text-lg font-semibold text-white">
                SoulSync <span className="text-gradient-brand">AI</span>
              </span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/55">
              AI-powered matchmaking that understands who you are, not just
              who you swipe on.
            </p>
            <div className="mt-6 flex items-center gap-2">
              {SOCIALS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="flex size-9 items-center justify-center rounded-full border border-white/10 text-white/60 transition-colors hover:border-primary/40 hover:text-white"
                >
                  <social.icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title} className="col-span-1 md:col-span-1">
              <h3 className="font-display text-sm font-semibold text-white">
                {title}
              </h3>
              <ul className="mt-4 space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-white/55 transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-xs text-white/40">
            &copy; {new Date().getFullYear()} SoulSync AI, Inc. All rights
            reserved.
          </p>
          <p className="text-xs text-white/40">
            Made with intelligence, for real connection.
          </p>
        </div>
      </div>
    </footer>
  );
}
