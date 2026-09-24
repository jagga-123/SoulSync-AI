"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, Users } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AdminHeading, LoadingBlock } from "@/components/admin/admin-shell";
import { Chip, Pagination, formatDateTime } from "@/components/admin/admin-ui";
import { useApi } from "@/hooks/use-api";
import { adminReport, adminReports, adminResolveReport, adminReviewReport } from "@/lib/api/platform";
import { errorMessage } from "@/lib/gate";
import { cn } from "@/lib/utils";
import type { AdminReport, ReportStatus, ResolveAction } from "@/types/platform";

const TABS = [
  { value: "open", label: "Pending" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
] as const;

const REASON_LABELS: Record<string, string> = {
  harassment: "Harassment", inappropriate_content: "Inappropriate content", scam: "Scam", fake_profile: "Fake profile", spam: "Spam", underage: "Underage", other: "Other",
};

const ACTIONS: Array<{ value: ResolveAction; label: string; help: string; danger?: boolean }> = [
  { value: "dismiss", label: "Dismiss", help: "No violation found. Nothing happens to the reported member." },
  { value: "warn", label: "Warn", help: "Send the member a warning notification." },
  { value: "hide_message", label: "Hide the reported message", help: "Replaces the message with “removed by moderators” for both people." },
  { value: "suspend", label: "Suspend the account", help: "Signs them out and blocks login. Reversible.", danger: true },
  { value: "delete_user", label: "Delete the account", help: "Permanently removes the account and all its data.", danger: true },
];

const statusTone = (s: ReportStatus) => (s === "pending" ? "warn" : s === "reviewing" ? "brand" : s === "resolved" ? "good" : "neutral");

export function ModerationView() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("open");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useApi(() => adminReports({ status: tab, page, limit: 20 }), [tab, page]);
  const counts = list.data?.counts ?? {};
  const openCount = (counts.pending ?? 0) + (counts.reviewing ?? 0);

  return (
    <div>
      <AdminHeading title="Moderation" description="Review reports, look at the context, and take action." />

      <div role="tablist" aria-label="Report status" className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const n = t.value === "open" ? openCount : t.value === "all" ? undefined : counts[t.value as ReportStatus];
          return (
            <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => { setTab(t.value); setPage(1); }} className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition-colors", tab === t.value ? "border-transparent bg-gradient-brand text-white" : "border-white/10 text-white/60 hover:text-white")}>
              {t.label}
              {n !== undefined && n > 0 && <span className="ml-1.5 text-xs opacity-80">{n}</span>}
            </button>
          );
        })}
      </div>

      {list.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{list.error}</AlertDescription>
        </Alert>
      )}

      {list.isLoading && !list.data ? (
        <LoadingBlock />
      ) : list.data?.reports.length === 0 ? (
        <div className="glass flex flex-col items-center gap-2 rounded-3xl py-16 text-center">
          <ShieldCheck className="size-8 text-emerald-300" />
          <p className="font-medium text-white">{tab === "open" ? "The queue is clear" : "Nothing here"}</p>
          <p className="text-sm text-white/60">{tab === "open" ? "No reports are waiting for review." : "No reports with this status."}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.data?.reports.map((r) => (
            <ReportRow key={r.id} report={r} onOpen={() => setSelected(r.id)} />
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={list.data?.pagination.totalPages ?? 1} onChange={setPage} />

      <ReportDialog reportId={selected} onClose={() => setSelected(null)} onChanged={() => void list.reload()} />
    </div>
  );
}

function ReportRow({ report, onOpen }: { report: AdminReport; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="glass flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl p-4 text-left transition-colors hover:border-white/25 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
            {report.reported?.fullName ?? "Deleted member"}
            <Chip tone={statusTone(report.status)}>{report.status}</Chip>
            <Chip>{REASON_LABELS[report.reason] ?? report.reason}</Chip>
            {report.distinctReporters > 1 && (
              <Chip tone="bad">
                <Users className="mr-1 size-3" /> {report.distinctReporters} reporters
              </Chip>
            )}
          </p>
          <p className="mt-1 truncate text-xs text-white/60">
            Reported by {report.reporter?.fullName ?? "a former member"}
            {report.details ? ` — “${report.details}”` : ""}
          </p>
        </div>
        <span className="text-xs text-white/60">{formatDateTime(report.createdAt)}</span>
      </button>
    </li>
  );
}

function ReportDialog({ reportId, onClose, onChanged }: { reportId: string | null; onClose: () => void; onChanged: () => void }) {
  const detail = useApi(() => (reportId ? adminReport(reportId) : Promise.resolve(null)), [reportId]);
  const [action, setAction] = useState<ResolveAction>("dismiss");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = detail.data;
  const closed = d ? d.report.status === "resolved" || d.report.status === "dismissed" : false;
  const hasMessage = Boolean(d?.report.context?.messageId);

  async function resolve() {
    if (!d) return;
    setBusy(true);
    setError(null);
    try {
      await adminResolveReport(d.report.id, action, note.trim());
      onChanged();
      setNote("");
      setAction("dismiss");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function review() {
    if (!d) return;
    await adminReviewReport(d.report.id).catch(() => {});
    onChanged();
    await detail.reload();
  }

  return (
    <Dialog open={reportId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {!d ? (
          detail.error ? <p className="text-sm text-destructive">{detail.error}</p> : <LoadingBlock />
        ) : (
          <>
            <DialogTitle>
              {REASON_LABELS[d.report.reason] ?? d.report.reason} — {d.reported?.fullName ?? "deleted member"}
            </DialogTitle>
            <DialogDescription>
              Reported by {d.reporter?.fullName ?? "a former member"} on {formatDateTime(d.report.createdAt)}
            </DialogDescription>

            <div className="mt-3 flex flex-wrap gap-2">
              <Chip tone={statusTone(d.report.status)}>{d.report.status}</Chip>
              {d.otherReportsAgainstUser > 0 && <Chip tone="warn">{d.otherReportsAgainstUser} other report{d.otherReportsAgainstUser === 1 ? "" : "s"} against them</Chip>}
              {d.reported?.status === "suspended" && <Chip tone="bad">Already suspended</Chip>}
            </div>

            {d.report.details && <p className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm text-white/75">“{d.report.details}”</p>}

            {d.reportedProfile && (
              <p className="mt-4 text-sm text-white/55">
                Profile: {d.reportedProfile.age}, {d.reportedProfile.city} — {d.reportedProfile.bio || "no bio"}
              </p>
            )}

            {d.messages.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-wider text-white/60">Their recent messages in the reported chat</p>
                <ul data-lenis-prevent className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                  {d.messages.map((m) => (
                    <li key={m.id} className={cn("rounded-xl border p-3 text-sm", m.isReported ? "border-primary/50 bg-primary/10 text-white" : "border-white/8 bg-white/[0.02] text-white/70")}>
                      {m.isReported && <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary">Reported message</span>}
                      {m.isHidden ? <em className="text-white/60">Hidden by moderators</em> : m.content}
                      <span className="mt-1 block text-xs text-white/60">{formatDateTime(m.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {closed ? (
              <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/65">
                Closed — {d.report.resolution?.action.replace("_", " ")}
                {d.report.resolution?.note ? `: ${d.report.resolution.note}` : ""}
              </p>
            ) : (
              <div className="mt-6 border-t border-white/10 pt-5">
                {d.report.status === "pending" && (
                  <Button variant="outline" size="sm" onClick={() => void review()} className="mb-4 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
                    Mark as in review
                  </Button>
                )}
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-white/60">Resolve</legend>
                  {ACTIONS.filter((a) => a.value !== "hide_message" || hasMessage).map((a) => (
                    <label key={a.value} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors", action === a.value ? "border-primary/60 bg-primary/10" : "border-white/10 hover:bg-white/5")}>
                      <input type="radio" name="resolve-action" checked={action === a.value} onChange={() => setAction(a.value)} className="mt-1 accent-[var(--primary)]" />
                      <span>
                        <span className={cn("block text-sm font-medium", a.danger ? "text-red-300" : "text-white")}>{a.label}</span>
                        <span className="block text-xs text-white/60">{a.help}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (kept in the audit log; shown to a suspended member as the reason)" aria-label="Resolution note" maxLength={1000} className="mt-3 min-h-16" />
                {error && (
                  <Alert variant="destructive" className="mt-3">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="mt-4 flex justify-end">
                  <Button onClick={() => void resolve()} disabled={busy} variant={action === "delete_user" || action === "suspend" ? "destructive" : "default"} className={cn("gap-2 rounded-full", action !== "delete_user" && action !== "suspend" && "bg-gradient-brand text-white hover:opacity-90")}>
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    {ACTIONS.find((a) => a.value === action)?.label}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
