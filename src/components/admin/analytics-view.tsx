"use client";

import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AdminHeading, LoadingBlock } from "@/components/admin/admin-shell";
import { AreaChart, FunnelBars, StatTile, formatNumber, formatPercent } from "@/components/admin/charts";
import { useApi } from "@/hooks/use-api";
import { adminFunnel, adminRates, adminRevenue, adminTimeseries } from "@/lib/api/platform";
import { formatMoney } from "@/lib/gate";
import { cn } from "@/lib/utils";
import { TIMESERIES_METRICS, type TimeseriesMetric } from "@/types/platform";

const METRIC_LABELS: Record<TimeseriesMetric, string> = {
  registrations: "Registrations",
  interviews: "Interviews completed",
  likes: "Likes",
  matches: "Matches",
  messages: "Messages",
  premium: "New subscriptions",
};
const RANGES = [7, 30, 90] as const;

export function AnalyticsView() {
  const [metric, setMetric] = useState<TimeseriesMetric>("registrations");
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);

  const series = useApi(() => adminTimeseries(metric, days), [metric, days]);
  const rates = useApi(adminRates);
  const funnel = useApi(adminFunnel);
  const revenue = useApi(adminRevenue);

  return (
    <div>
      <AdminHeading title="Analytics" description="Growth, engagement and revenue across the platform." />

      {rates.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{rates.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Interview completion rate" value={formatPercent(rates.data?.interviewCompletionRate ?? null)} sub={rates.data ? `${formatNumber(rates.data.counts.completed ?? 0)} of ${formatNumber(rates.data.counts.withProfile ?? 0)} profiles` : undefined} />
        <StatTile label="Match rate" value={formatPercent(rates.data?.matchRate ?? null)} sub={rates.data ? `${formatNumber(rates.data.counts.matchedUsers ?? 0)} members matched · ${formatPercent(rates.data.likeToMatchRate)} of likes` : undefined} />
        <StatTile label="Message rate" value={rates.data?.messagesPerActiveUser7d ?? "—"} sub={rates.data ? `messages per active user (7d) · ${formatPercent(rates.data.conversationRate)} of matches chat` : undefined} />
        <StatTile label="Premium conversion" value={formatPercent(rates.data?.premiumConversion ?? null)} sub={rates.data ? `${formatNumber(rates.data.counts.paidTotal ?? 0)} paying of ${formatNumber(rates.data.counts.users ?? 0)} members` : undefined} />
      </div>

      <section className="glass mt-6 rounded-3xl p-6" aria-labelledby="trend">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="trend" className="font-display text-lg font-semibold text-white">
            {METRIC_LABELS[metric]}
          </h2>
          <div role="group" aria-label="Date range" className="flex rounded-full border border-white/10 bg-white/[0.03] p-0.5">
            {RANGES.map((r) => (
              <button key={r} type="button" aria-pressed={days === r} onClick={() => setDays(r)} className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", days === r ? "bg-white/15 text-white" : "text-white/55 hover:text-white")}>
                {r} days
              </button>
            ))}
          </div>
        </div>

        <div role="tablist" aria-label="Metric" className="mt-4 flex flex-wrap gap-1.5">
          {TIMESERIES_METRICS.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={metric === m} onClick={() => setMetric(m)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", metric === m ? "border-transparent bg-gradient-brand text-white" : "border-white/10 text-white/60 hover:text-white")}>
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>

        <div className="mt-5">{series.data ? <AreaChart points={series.data.points} unit={METRIC_LABELS[metric].toLowerCase()} /> : series.error ? <p className="text-sm text-destructive">{series.error}</p> : <LoadingBlock />}</div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="glass rounded-3xl p-6 xl:col-span-2" aria-labelledby="funnel-h">
          <h2 id="funnel-h" className="mb-1 font-display text-lg font-semibold text-white">
            Conversion funnel
          </h2>
          <p className="mb-4 text-xs text-white/60">Each step shows the count and the share of the step before it.</p>
          {funnel.data ? <FunnelBars steps={funnel.data.steps} /> : <LoadingBlock />}
        </section>

        <section className="glass rounded-3xl p-6" aria-labelledby="rev">
          <h2 id="rev" className="mb-4 font-display text-lg font-semibold text-white">
            Revenue (30 days)
          </h2>
          {!revenue.data ? (
            <LoadingBlock />
          ) : revenue.data.byCurrency.length === 0 ? (
            <p className="text-sm text-white/60">No payments yet.</p>
          ) : (
            <ul className="space-y-4">
              {revenue.data.byCurrency.map((row) => (
                <li key={row.currency}>
                  <p className="text-3xl font-semibold text-white">{formatMoney(row.amountMinor, row.currency)}</p>
                  <p className="text-xs text-white/60">
                    {row.payments} payment{row.payments === 1 ? "" : "s"} · {row.currency.toUpperCase()}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-white/60">Currencies are never added together.</p>
        </section>
      </div>
    </div>
  );
}
