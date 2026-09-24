"use client";

import { useState } from "react";
import { CircleCheck, CircleX, Loader2, Play, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AdminHeading, LoadingBlock } from "@/components/admin/admin-shell";
import { Chip, DataTable, FilterSelect, Pagination, Td, Th, formatDateTime } from "@/components/admin/admin-ui";
import { StatTile } from "@/components/admin/charts";
import { useApi } from "@/hooks/use-api";
import { adminAudit, adminEmailLog, adminRunJob, adminSystem } from "@/lib/api/platform";
import { errorMessage } from "@/lib/gate";
import { cn } from "@/lib/utils";

const uptime = (seconds: number) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const every = (ms: number) => (ms >= 3_600_000 ? `every ${Math.round(ms / 3_600_000)}h` : `every ${Math.round(ms / 60_000)}m`);

export function SystemView() {
  const system = useApi(adminSystem);
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<"email" | "audit">("audit");

  async function run(name: string) {
    setRunning(name);
    setMessage(null);
    try {
      const { result } = await adminRunJob(name);
      setMessage(`${name}: ${result.status}`);
      await system.reload();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setRunning(null);
    }
  }

  if (system.isLoading && !system.data) return <LoadingBlock />;
  if (!system.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{system.error ?? "Couldn't load system status."}</AlertDescription>
      </Alert>
    );
  }
  const s = system.data;

  return (
    <div>
      <AdminHeading title="System" description="Health, providers, scheduled jobs and logs." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Database" value={<span className="flex items-center gap-2 text-2xl">{s.database.connected ? <CircleCheck className="size-6 text-emerald-300" /> : <CircleX className="size-6 text-red-300" />}{s.database.connected ? "Connected" : "Down"}</span>} sub={`${s.environment} · Node ${s.node}`} />
        <StatTile label="Uptime" value={uptime(s.uptimeSeconds)} sub={`${s.memoryMb} MB memory`} />
        <StatTile label="Live connections" value={s.socketConnections} sub="Socket.IO clients" />
        <StatTile label="Email failures (24h)" value={s.emailFailuresLast24h} sub={`${s.pendingReports} report${s.pendingReports === 1 ? "" : "s"} pending`} />
      </div>

      {s.warnings.length > 0 && (
        <div role="status" className="mt-6 rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
            <TriangleAlert className="size-4" /> {s.warnings.length} launch warning{s.warnings.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/65">
            {s.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="glass mt-6 rounded-3xl p-6" aria-labelledby="providers">
        <h2 id="providers" className="mb-4 font-display text-lg font-semibold text-white">
          Providers
        </h2>
        <dl className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
          {[
            ["AI", s.providers.ai],
            ["Email", s.providers.email],
            ["Payments", s.providers.payments],
            ["Error tracking", s.providers.errorTracking],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-white/60">{label}</dt>
              <dd className="mt-0.5 font-medium capitalize text-white">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-white/60">
          {s.flagsEnabled} of {s.flagsTotal} feature flags are on.
        </p>
      </section>

      <section className="mt-6" aria-labelledby="jobs">
        <h2 id="jobs" className="mb-3 font-display text-lg font-semibold text-white">
          Scheduled jobs
        </h2>
        {message && <p role="status" className="mb-2 text-sm text-white/65">{message}</p>}
        <DataTable minWidth="36rem">
          <thead>
            <tr>
              <Th>Job</Th>
              <Th>Schedule</Th>
              <Th>Last run</Th>
              <Th>Result</Th>
              <Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {s.jobs.map((job) => (
              <tr key={job.name}>
                <Td className="font-mono text-xs text-white">{job.name}</Td>
                <Td className="text-white/55">{every(job.intervalMs)}</Td>
                <Td className="text-white/55">{formatDateTime(job.lastRunAt)}</Td>
                <Td>
                  {job.lastStatus === null ? <Chip>Never run</Chip> : <Chip tone={job.lastStatus === "ok" ? "good" : "bad"}>{job.lastStatus}</Chip>}
                  {job.lastError && <span className="ml-2 text-xs text-red-300">{job.lastError}</span>}
                </Td>
                <Td className="text-right">
                  <Button size="sm" variant="outline" disabled={running !== null} onClick={() => void run(job.name)} className="gap-1.5 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
                    {running === job.name ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                    Run now
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </section>

      <section className="mt-8" aria-label="Logs">
        <div role="tablist" aria-label="Log" className="mb-3 flex gap-1.5">
          {(["audit", "email"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition-colors", tab === t ? "border-transparent bg-gradient-brand text-white" : "border-white/10 text-white/60 hover:text-white")}>
              {t === "audit" ? "Audit log" : "Email log"}
            </button>
          ))}
        </div>
        {tab === "audit" ? <AuditLog /> : <EmailLog />}
      </section>
    </div>
  );
}

function AuditLog() {
  const [page, setPage] = useState(1);
  const log = useApi(() => adminAudit(page), [page]);
  if (!log.data) return <LoadingBlock />;
  return (
    <>
      <DataTable minWidth="44rem">
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Admin</Th>
            <Th>Action</Th>
            <Th>Target</Th>
            <Th>Details</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {log.data.entries.map((e) => (
            <tr key={e.id}>
              <Td className="whitespace-nowrap text-white/50">{formatDateTime(e.createdAt)}</Td>
              <Td>{e.actorEmail}</Td>
              <Td className="font-mono text-xs text-white">{e.action}</Td>
              <Td className="text-white/55">{e.targetType}{e.targetId ? ` · ${e.targetId.slice(-6)}` : ""}</Td>
              <Td className="max-w-[16rem] truncate font-mono text-xs text-white/60" >{Object.keys(e.metadata ?? {}).length ? JSON.stringify(e.metadata) : ""}</Td>
            </tr>
          ))}
          {log.data.entries.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-white/60">No admin actions yet.</td>
            </tr>
          )}
        </tbody>
      </DataTable>
      <Pagination page={page} totalPages={log.data.pagination.totalPages} onChange={setPage} />
    </>
  );
}

function EmailLog() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const log = useApi(() => adminEmailLog(status || undefined, page), [status, page]);
  return (
    <>
      <FilterSelect label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="mb-3">
        <option value="">All</option>
        <option value="sent">Sent</option>
        <option value="failed">Failed</option>
        <option value="skipped">Skipped</option>
      </FilterSelect>
      {!log.data ? (
        <LoadingBlock />
      ) : (
        <>
          <DataTable minWidth="44rem">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>To</Th>
                <Th>Template</Th>
                <Th>Provider</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {log.data.entries.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap text-white/50">{formatDateTime(e.createdAt)}</Td>
                  <Td>{e.to}</Td>
                  <Td className="font-mono text-xs text-white">{e.template}</Td>
                  <Td className="text-white/55">{e.provider}</Td>
                  <Td>
                    <Chip tone={e.status === "sent" ? "good" : e.status === "failed" ? "bad" : "neutral"}>{e.status}</Chip>
                    {e.error && <span className="ml-2 text-xs text-red-300">{e.error}</span>}
                  </Td>
                </tr>
              ))}
              {log.data.entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-white/60">No emails yet.</td>
                </tr>
              )}
            </tbody>
          </DataTable>
          <Pagination page={page} totalPages={log.data.pagination.totalPages} onChange={setPage} />
        </>
      )}
    </>
  );
}
