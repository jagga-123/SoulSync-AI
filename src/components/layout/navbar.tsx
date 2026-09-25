"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Dialog } from "radix-ui";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { usePlatform } from "@/components/platform/platform-provider";
import { PRIMARY_DESTINATIONS, isActive } from "@/components/layout/nav-config";
import { NAV_LINKS } from "@/lib/data";
import { cn } from "@/lib/utils";

// Only signed-in members see these, and both pull in the animation library — so they load on demand instead of
// weighing down every visitor's first page. The placeholders keep the bar from shifting when they arrive.
const NotificationBell = dynamic(() => import("@/components/platform/notification-bell").then((m) => m.NotificationBell), {
  loading: () => <span aria-hidden className="size-11" />,
});
const UserMenu = dynamic(() => import("@/components/platform/user-menu").then((m) => m.UserMenu), {
  loading: () => <span aria-hidden className="size-11" />,
});

const linkClass =
  "relative rounded-md py-2 text-[15px] font-medium text-white/75 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The top bar. Two modes:
 *  - marketing (signed out, or the landing page): logo, section links, Sign in / Get started, and a full-height menu sheet on phones;
 *  - app (signed in, anywhere but "/"): logo, the four daily destinations on desktop, bell + account menu. On phones the
 *    bar is just logo mark + bell + avatar — navigation moves to the bottom tab bar (see MobileTabBar).
 */
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { isAuthed } = usePlatform();
  const pathname = usePathname();
  const appMode = isAuthed && pathname !== "/";

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 16);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300",
        scrolled ? "border-border bg-background/85 backdrop-blur-md" : "border-transparent bg-transparent",
      )}
    >
      <div
        className={cn(
          // Same container width as the page below it (landing sections: max-w-8xl, member pages: max-w-7xl), so the logo lines up with the content.
          "mx-auto flex items-center justify-between gap-4 px-4 transition-[height] duration-300 sm:px-6 lg:px-8",
          appMode ? "h-14 max-w-7xl md:h-[72px]" : "h-16 max-w-8xl md:h-[72px]",
          scrolled && "md:h-16",
        )}
      >
        <Link
          href={appMode ? "/dashboard" : "/"}
          aria-label="SoulSync home"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo compact={appMode} />
        </Link>

        <nav aria-label={appMode ? "Main" : "Sections"} className="hidden items-center gap-8 md:flex">
          {appMode
            ? PRIMARY_DESTINATIONS.map(({ href, label }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(linkClass, active && "text-white after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-primary")}
                  >
                    {label}
                  </Link>
                );
              })
            : NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className={linkClass}>
                  {link.label}
                </Link>
              ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          {isAuthed ? (
            <>
              <NotificationBell />
              <UserMenu />
            </>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Button asChild variant="ghost" className="h-11 rounded-full px-5 text-[15px] text-white/80 hover:text-white">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button
                asChild
                className="h-11 rounded-full bg-primary-solid px-6 text-[15px] font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary-solid/90"
              >
                <Link href="/register">Get started</Link>
              </Button>
            </div>
          )}

          {!appMode && (
            <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <Dialog.Trigger
                aria-label="Open menu"
                className="flex size-11 items-center justify-center rounded-full text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring md:hidden"
              >
                <Menu className="size-6" aria-hidden />
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 md:hidden" />
                <Dialog.Content
                  aria-describedby={undefined}
                  className="fixed inset-0 z-[70] flex flex-col bg-background outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-4 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-4 md:hidden"
                >
                  <Dialog.Title className="sr-only">Menu</Dialog.Title>
                  <div className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-6">
                    <Dialog.Close asChild>
                      <Link href="/" aria-label="SoulSync home" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Logo />
                      </Link>
                    </Dialog.Close>
                    <Dialog.Close
                      aria-label="Close menu"
                      className="flex size-11 items-center justify-center rounded-full text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-6" aria-hidden />
                    </Dialog.Close>
                  </div>

                  <nav aria-label="Sections" className="flex-1 overflow-y-auto px-4 sm:px-6">
                    <ul className="divide-y divide-border">
                      {NAV_LINKS.map((link) => (
                        <li key={link.href}>
                          <Dialog.Close asChild>
                            <Link
                              href={link.href}
                              className="flex h-14 items-center font-display text-[22px] font-semibold text-foreground outline-none transition-colors hover:text-primary focus-visible:text-primary"
                            >
                              {link.label}
                            </Link>
                          </Dialog.Close>
                        </li>
                      ))}
                    </ul>
                  </nav>

                  {!isAuthed && (
                    <div className="shrink-0 border-t border-border px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 sm:px-6">
                      <div className="flex flex-col gap-3">
                        <Dialog.Close asChild>
                          <Button asChild className="h-14 w-full rounded-full bg-primary-solid text-base font-semibold text-white hover:bg-primary-solid/90">
                            <Link href="/register">Get started</Link>
                          </Button>
                        </Dialog.Close>
                        <Dialog.Close asChild>
                          <Button asChild variant="outline" className="h-14 w-full rounded-full border-border bg-transparent text-base font-semibold text-white hover:bg-white/5">
                            <Link href="/login">Sign in</Link>
                          </Button>
                        </Dialog.Close>
                      </div>
                      <p className="mt-3 text-center text-xs text-white/60">Free to join · About 10 minutes</p>
                    </div>
                  )}
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          )}
        </div>
      </div>
    </header>
  );
}
