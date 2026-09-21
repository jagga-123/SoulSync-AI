"use client";

import Link from "next/link";
import { ArrowRight, Flag } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AdminHeading, LoadingBlock } from "@/components/admin/admin-shell";
import { AreaChart, FunnelBars, StatTile, formatNumber } from "@/components/admin/charts";
import { useApi } from "@/hooks/use-api";
import { adminFunnel, adminOverview, adminTimeseries } from "@/lib/api/platform";

export function OverviewView() {
  const overview = useApi(adminOverview);
  const registrations = useApi(() => adminTimeseries("registrations", 30));
  const funnel = useApi(adminFunnel);

  if (overview.isLoading) return <LoadingBlock />;
  if (overview.error || !overview.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{overview.error ?? "Couldn't load the overview."}</AlertDescription>
      </Alert>
    );
  }
  const o = overview.data;

  return (
    <div>
      <AdminHeading title="Overview" description={`Updated ${new Date(o.generatedAt).toLocaleTimeString()} · refreshed at most once a minute`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="Total users" value={formatNumber(o.users.total)} sub={`${formatNumber(o.users.emailVerified)} verified · ${o.users.suspended} suspended`} />
        <StatTile label="Active users (24h)" value={formatNumber(o.users.active24h)} sub={`${formatNumber(o.users.active7d)} in 7 days · ${formatNumber(o.users.active30d)} in 30 days`} />
        <StatTile label="New registrations (7d)" value={formatNumber(o.users.new7d)} sub={`${formatNumber(o.users.new30d)} in the last 30 days`} />
        <StatTile label="Matches created" value={formatNumber(o.matches.total)} sub={`${formatNumber(o.matches.last7d)} in the last 7 days`} />
        <StatTile label="Messages sent" value={formatNumber(o.messages.total)} sub={`${formatNumber(o.messages.last7d)} in the last 7 days`} />
        <StatTile
          label="Premium subscribers"
          value={formatNumber(o.premium.subscribers)}
          sub={`${o.premium.byPlan.premium} Premium · ${o.premium.byPlan.premium_plus} Plus · MRR $${o.premium.mrrUsd.toLocaleString()}`}
        />
      </div>

      {o.moderation.pendingReports > 0 && (
        <Link
          href="/admin/moderation"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/[0.07] p-4 text-sm text-white/80 transition-colors hover:bg-primary/[0.1]"
        >
          <Flag className="size-5 shrink-0 text-primary" />
          <span className="flex-1">
            <strong className="text-white">{o.moderation.pendingReports}</strong> report{o.moderation.pendingReports === 1 ? "" : "s"} waiting for review.
          </span>
          <ArrowRight className="size-4 text-accent" />
        </Link>
      )}

      <section className="glass mt-6 rounded-3xl p-6" aria-labelledby="reg-chart">
        <h2 id="reg-chart" className="mb-4 font-display text-lg font-semibold text-white">
          Registrations
        </h2>
        {registrations.data ? <AreaChart points={registrations.data.points} unit="registrations" /> : <LoadingBlock />}
      </section>

      <section className="glass mt-6 rounded-3xl p-6" aria-labelledby="funnel">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="funnel" className="font-display text-lg font-semibold text-white">
            Member journey
          </h2>
          <Link href="/admin/analytics" className="text-sm text-accent hover:underline">
            Full analytics
          </Link>
        </div>
        {funnel.data ? <FunnelBars steps={funnel.data.steps} /> : <LoadingBlock />}
      </section>
    </div>
  );
}
