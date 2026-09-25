"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, Flag, LayoutDashboard, ListChecks, Loader2, ShieldAlert, ToggleRight, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { adminOverview } from "@/lib/api/platform";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/moderation", label: "Moderation", icon: Flag, badge: true },
  { href: "/admin/flags", label: "Feature flags", icon: ToggleRight },
  { href: "/admin/waitlist", label: "Waitlist", icon: ListChecks },
  { href: "/admin/system", label: "System", icon: Activity },
];

/** Frame for everything under /admin: admin-only guard + navigation. */
export function AdminShell({ children }: { children: ReactNode }) {
  const { user, isLoading } = useRequireAuth();
  const pathname = usePathname();
  const [pendingReports, setPendingReports] = useState(0);
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    adminOverview()
      .then((o) => setPendingReports(o.moderation.pendingReports))
      .catch(() => {});
  }, [isAdmin, pathname]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-white/60" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
          <ShieldAlert className="size-6 text-white/50" />
        </span>
        <h1 className="font-display text-2xl font-semibold text-white">Admins only</h1>
        <p className="max-w-sm text-sm text-white/55">This area is restricted to SoulSync administrators.</p>
        <Button asChild className="rounded-full bg-gradient-brand text-white hover:opacity-90">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="lg:w-56 lg:shrink-0">
          <p className="mb-3 hidden text-xs font-semibold uppercase tracking-wider text-white/60 lg:block">Admin</p>
          <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.map(({ href, label, icon: Icon, exact, badge }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                    active ? "bg-gradient-brand text-white shadow-lg shadow-primary/20" : "text-white/60 hover:bg-white/8 hover:text-white",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                  {badge && pendingReports > 0 && (
                    <span className={cn("ml-auto rounded-full px-1.5 text-xs font-semibold", active ? "bg-white/25 text-white" : "bg-primary/20 text-primary")}>{pendingReports}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

export function AdminHeading({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <h1 className="font-display text-2xl font-semibold text-white sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-white/50">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function LoadingBlock() {
  return (
    <div className="flex justify-center py-16 text-white/60">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}
