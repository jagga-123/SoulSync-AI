"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, LogOut, UserRound, X } from "lucide-react";
import { Dialog } from "radix-ui";

import { AvatarOrb } from "@/components/ui/avatar-orb";
import { usePlatform } from "@/components/platform/platform-provider";
import { ACCOUNT_LINKS, ME_ROUTES, PRIMARY_DESTINATIONS, isActive, tabBarHidden } from "@/components/layout/nav-config";
import { useTabBadges } from "@/hooks/use-tab-badges";
import { PLAN_NAMES } from "@/lib/gate";
import { getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";

const badgeText = (n: number) => (n > 9 ? "9+" : String(n));

/**
 * Phone navigation for signed-in members: Discover · Likes · Matches · Messages · Me.
 * "Me" opens a bottom sheet with everything else (report, settings, plan…), so all existing routes stay reachable.
 * Hidden on desktop (the top bar has the same destinations), on marketing/auth pages and inside a chat thread.
 */
export function MobileTabBar() {
  const { isAuthed, user, features, signOut } = usePlatform();
  const pathname = usePathname();
  const router = useRouter();
  const [meOpen, setMeOpen] = useState(false);
  const meButtonRef = useRef<HTMLButtonElement>(null);
  const visible = isAuthed && !tabBarHidden(pathname);
  const badges = useTabBadges(visible, pathname);

  // Reserve room below the page content (CSS in globals.css keys off this attribute, below the md breakpoint only).
  useEffect(() => {
    if (!visible) return;
    document.body.dataset.tabbar = "on";
    return () => {
      delete document.body.dataset.tabbar;
    };
  }, [visible]);

  useEffect(() => setMeOpen(false), [pathname]);

  if (!visible) return null;

  const meActive = ME_ROUTES.some((href) => isActive(pathname, href));
  const counts: Record<string, number> = { "/likes": badges.likes, "/messages": badges.messages };
  const plan = features?.plan ?? "free";

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {PRIMARY_DESTINATIONS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            const count = counts[href] ?? 0;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={count > 0 ? `${label}, ${count} new` : label}
                  className={cn(
                    "relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium outline-none transition-colors focus-visible:bg-white/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    active ? "text-primary" : "text-white/70 active:text-white",
                  )}
                >
                  <span className="relative">
                    <Icon className={cn("size-6", active && "fill-primary/15")} strokeWidth={active ? 2.1 : 1.75} aria-hidden />
                    {count > 0 && (
                      <span
                        aria-hidden
                        className="absolute -right-3 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-solid px-1 text-xs font-semibold leading-none text-white ring-2 ring-background"
                      >
                        {badgeText(count)}
                      </span>
                    )}
                  </span>
                  <span aria-hidden>{label}</span>
                  <span className={cn("absolute bottom-1.5 size-1 rounded-full bg-primary transition-opacity", active ? "opacity-100" : "opacity-0")} aria-hidden />
                </Link>
              </li>
            );
          })}

          <li>
            <button
              ref={meButtonRef}
              type="button"
              onClick={() => setMeOpen(true)}
              aria-label="Me"
              aria-haspopup="dialog"
              aria-expanded={meOpen}
              className={cn(
                "relative flex h-16 w-full flex-col items-center justify-center gap-1 text-xs font-medium outline-none transition-colors focus-visible:bg-white/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                meActive ? "text-primary" : "text-white/70 active:text-white",
              )}
            >
              {user ? (
                <span aria-hidden>
                  <AvatarOrb
                    initials={getInitials(user.fullName)}
                    className={cn("size-6 text-xs", meActive && "ring-primary")}
                    ringed
                  />
                </span>
              ) : (
                <UserRound className="size-6" strokeWidth={1.75} aria-hidden />
              )}
              <span aria-hidden>Me</span>
              <span className={cn("absolute bottom-1.5 size-1 rounded-full bg-primary transition-opacity", meActive ? "opacity-100" : "opacity-0")} aria-hidden />
            </button>
          </li>
        </ul>
      </nav>

      <Dialog.Root open={meOpen} onOpenChange={setMeOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 md:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            // The sheet is opened by a separate button (not a Dialog.Trigger), so hand focus back to it explicitly.
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              meButtonRef.current?.focus();
            }}
            className="fixed inset-x-0 bottom-0 z-[70] max-h-[88svh] overflow-y-auto rounded-t-3xl border-t border-border bg-card pb-[calc(1rem+env(safe-area-inset-bottom))] outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom md:hidden"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-card px-5 pb-3 pt-5">
              <div className="flex min-w-0 items-center gap-3">
                {user && <AvatarOrb initials={getInitials(user.fullName)} className="size-12 text-base" />}
                <div className="min-w-0">
                  <Dialog.Title className="truncate font-display text-lg font-semibold text-foreground">
                    {user?.fullName ?? "Me"}
                  </Dialog.Title>
                  {user && <p className="truncate text-sm text-muted-foreground">{user.email}</p>}
                  <span className="mt-1 inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
                    {PLAN_NAMES[plan]} plan
                  </span>
                </div>
              </div>
              <Dialog.Close
                aria-label="Close"
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-white/80 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-5" aria-hidden />
              </Dialog.Close>
            </div>

            <nav aria-label="Account" className="px-3">
              <ul>
                {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => (
                  <li key={href}>
                    <Dialog.Close asChild>
                      <Link
                        href={href}
                        aria-current={isActive(pathname, href) ? "page" : undefined}
                        className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-base text-foreground outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-white/5 aria-[current=page]:text-primary"
                      >
                        <Icon className="size-5 text-muted-foreground" aria-hidden />
                        {label}
                      </Link>
                    </Dialog.Close>
                  </li>
                ))}
                {user?.role === "admin" && (
                  <li>
                    <Dialog.Close asChild>
                      <Link href="/admin" className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-base text-accent outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring">
                        <BarChart3 className="size-5" aria-hidden />
                        Admin dashboard
                      </Link>
                    </Dialog.Close>
                  </li>
                )}
              </ul>
            </nav>

            <div className="mx-3 mt-2 border-t border-border pt-2">
              <button
                type="button"
                onClick={() => {
                  setMeOpen(false);
                  signOut();
                  router.push("/login");
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-base text-foreground outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="size-5 text-muted-foreground" aria-hidden />
                Sign out
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
