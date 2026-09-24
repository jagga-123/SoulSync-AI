"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Bell, ChevronDown, CreditCard, Gift, LayoutDashboard, LogOut, Settings, Sparkles } from "lucide-react";

import { AvatarOrb } from "@/components/ui/avatar-orb";
import { usePlatform } from "@/components/platform/platform-provider";
import { useDismiss } from "@/hooks/use-dismiss";
import { PLAN_NAMES } from "@/lib/gate";
import { getInitials } from "@/lib/format";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/premium", label: "My perks", icon: Sparkles },
  { href: "/billing", label: "Plan & billing", icon: CreditCard },
  { href: "/referrals", label: "Invite friends", icon: Gift },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function UserMenu() {
  const { user, features, signOut } = usePlatform();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  useEffect(() => close(), [pathname, close]);

  if (!user) return <span className="size-9 animate-pulse rounded-full bg-white/10" aria-hidden />;

  const plan = features?.plan ?? "free";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-11 items-center gap-1.5 rounded-full px-1.5 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      >
        <AvatarOrb initials={getInitials(user.fullName)} gradient="from-primary to-secondary" className="size-8 text-xs" />
        <ChevronDown className="size-3.5 text-white/50" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="glass-strong absolute right-0 top-full z-50 mt-3 w-64 overflow-hidden rounded-2xl shadow-2xl shadow-black/50"
          >
            <div className="border-b border-white/10 px-4 py-3">
              <p className="truncate text-sm font-semibold text-white">{user.fullName}</p>
              <p className="truncate text-xs text-white/60">{user.email}</p>
              <span className="mt-2 inline-flex rounded-full bg-gradient-brand px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                {PLAN_NAMES[plan]}
              </span>
            </div>

            <nav className="p-1.5">
              {ITEMS.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/75 transition-colors hover:bg-white/8 hover:text-white">
                  <Icon className="size-4 text-white/60" />
                  {label}
                </Link>
              ))}
              {user.role === "admin" && (
                <Link href="/admin" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-accent transition-colors hover:bg-white/8">
                  <BarChart3 className="size-4" />
                  Admin dashboard
                </Link>
              )}
            </nav>

            <div className="border-t border-white/10 p-1.5">
              <button
                type="button"
                onClick={() => {
                  signOut();
                  router.push("/login");
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-white/75 transition-colors hover:bg-white/8 hover:text-white"
              >
                <LogOut className="size-4 text-white/60" />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
