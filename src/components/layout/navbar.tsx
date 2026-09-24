"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MagneticButton } from "@/components/effects/magnetic-button";
import { NotificationBell } from "@/components/platform/notification-bell";
import { usePlatform } from "@/components/platform/platform-provider";
import { UserMenu } from "@/components/platform/user-menu";
import { NAV_LINKS } from "@/lib/data";
import { cn } from "@/lib/utils";

// Signed-in visitors get app links instead of the landing page's in-page anchors
// (which only make sense on the home page).
const APP_LINKS = [
  { label: "Discover", href: "/discover" },
  { label: "Likes", href: "/likes" },
  { label: "Matches", href: "/matches" },
  { label: "Messages", href: "/messages" },
  { label: "AI interview", href: "/ai-interview" },
];

function NavAnchor({ href, ...props }: React.ComponentProps<"a">) {
  return href?.startsWith("/") ? <Link href={href} {...props} /> : <a href={href} {...props} />;
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { isAuthed } = usePlatform();
  const pathname = usePathname();
  const links = isAuthed && pathname !== "/" ? APP_LINKS : NAV_LINKS;

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 16);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled ? "py-3" : "py-5",
      )}
    >
      <div className="mx-auto max-w-8xl px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            "flex items-center justify-between rounded-2xl px-4 py-3 transition-all duration-500 sm:px-5",
            scrolled ? "glass shadow-lg shadow-black/20" : "bg-transparent",
          )}
        >
          <a href={isAuthed && pathname !== "/" ? "/dashboard" : "/#top"} className="group flex items-center gap-2">
            <span className="relative flex size-8 items-center justify-center rounded-xl bg-gradient-brand">
              <Heart className="size-4 fill-white text-white" />
              <span className="absolute inset-0 rounded-xl bg-gradient-brand opacity-60 blur-md transition-opacity group-hover:opacity-90" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-white">
              SoulSync <span className="text-gradient-brand">AI</span>
            </span>
          </a>

          <nav className="hidden items-center gap-8 md:flex">
            {links.map((link) => (
              <NavAnchor
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-white/75 transition-colors hover:text-white"
              >
                {link.label}
              </NavAnchor>
            ))}
          </nav>

          {isAuthed && (
            <div className="flex items-center gap-1">
              <NotificationBell />
              <UserMenu />
            </div>
          )}

          <div className={isAuthed ? "hidden" : "hidden items-center gap-3 md:flex"}>
            <Button asChild variant="ghost" className="text-white/80 hover:text-white">
              <Link href="/login">Sign in</Link>
            </Button>
            <MagneticButton>
              <Button asChild className="bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90">
                <Link href="/register">Get started</Link>
              </Button>
            </MagneticButton>
          </div>

          <button
            type="button"
            aria-label="Toggle navigation menu"
            className="flex size-11 items-center justify-center rounded-lg text-white md:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden md:hidden"
            >
              <div className="glass mt-2 flex flex-col gap-1 rounded-2xl p-4">
                {links.map((link) => (
                  <NavAnchor
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                  >
                {link.label}
              </NavAnchor>
                ))}
                <div className={isAuthed ? "hidden" : "mt-2 flex flex-col gap-2 border-t border-white/10 pt-3"}>
                  <Button asChild variant="ghost" className="justify-center text-white/80">
                    <Link href="/login" onClick={() => setOpen(false)}>
                      Sign in
                    </Link>
                  </Button>
                  <Button asChild className="justify-center bg-gradient-brand text-white">
                    <Link href="/register" onClick={() => setOpen(false)}>
                      Get started
                    </Link>
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
