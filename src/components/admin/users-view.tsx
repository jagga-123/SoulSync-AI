"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AdminHeading, LoadingBlock } from "@/components/admin/admin-shell";
import { Chip, DataTable, FilterSelect, Pagination, Td, Th, formatDateTime, formatDay } from "@/components/admin/admin-ui";
import { useApi } from "@/hooks/use-api";
import { adminDeleteUser, adminGrantPlan, adminRevokePlan, adminSuspend, adminUnsuspend, adminUser, adminUsers } from "@/lib/api/platform";
import { errorMessage, formatMoney, PLAN_NAMES } from "@/lib/gate";
import type { AdminUserRow, PaidPlanId } from "@/types/platform";

export function UsersView() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [plan, setPlan] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(input.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const list = useApi(() => adminUsers({ query, status, role, plan, page, limit: 20 }), [query, status, role, plan, page]);

  return (
    <div>
      <AdminHeading title="Users" description="Search members, review activity, and take account actions." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/60" />
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search name or email" aria-label="Search users" className="pl-9" />
        </div>
        <FilterSelect label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </FilterSelect>
        <FilterSelect label="Role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">Any role</option>
          <option value="user">Members</option>
          <option value="admin">Admins</option>
        </FilterSelect>
        <FilterSelect label="Plan" value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1); }}>
          <option value="">Any plan</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
          <option value="premium_plus">Premium Plus</option>
        </FilterSelect>
      </div>

      {list.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{list.error}</AlertDescription>
        </Alert>
      )}

      {list.isLoading && !list.data ? (
        <LoadingBlock />
      ) : (
        <>
          <DataTable>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th>Joined</Th>
                <Th>Last active</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {list.data?.users.map((u) => (
                <UserRow key={u.id} user={u} onOpen={() => setSelected(u.id)} />
              ))}
              {list.data?.users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-white/60">
                    No members match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>
          <p className="mt-2 text-xs text-white/60">{list.data?.pagination.total ?? 0} member{list.data?.pagination.total === 1 ? "" : "s"}</p>
          <Pagination page={page} totalPages={list.data?.pagination.totalPages ?? 1} onChange={setPage} />
        </>
      )}

      <UserDialog userId={selected} onClose={() => setSelected(null)} onChanged={() => void list.reload()} />
    </div>
  );
}

function UserRow({ user, onOpen }: { user: AdminUserRow; onOpen: () => void }) {
  return (
    <tr className="cursor-pointer transition-colors hover:bg-white/[0.04]" onClick={onOpen}>
      <Td>
        <button type="button" onClick={onOpen} className="text-left outline-none focus-visible:underline">
          <span className="font-medium text-white">{user.fullName}</span>
          {user.role === "admin" && <span className="ml-2"><Chip tone="brand">Admin</Chip></span>}
          <span className="block text-xs text-white/60">{user.email}</span>
        </button>
      </Td>
      <Td>{PLAN_NAMES[user.plan]}</Td>
      <Td>
        {user.status === "suspended" ? <Chip tone="bad">Suspended</Chip> : <Chip tone="good">Active</Chip>}
        {!user.emailVerified && <span className="ml-1.5"><Chip>Unverified</Chip></span>}
      </Td>
      <Td className="text-white/55">{formatDay(user.createdAt)}</Td>
      <Td className="text-white/55">{formatDateTime(user.lastActiveAt)}</Td>
    </tr>
  );
}

type Action = "suspend" | "grant" | "delete" | null;

function UserDialog({ userId, onClose, onChanged }: { userId: string | null; onClose: () => void; onChanged: () => void }) {
  const detail = useApi(() => (userId ? adminUser(userId) : Promise.resolve(null)), [userId]);
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState<PaidPlanId>("premium");
  const [days, setDays] = useState("30");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setAction(null);
    setReason("");
    setConfirmEmail("");
    setError(null);
    setNotice(null);
  }, [userId]);

  const d = detail.data;

  async function run(work: () => Promise<unknown>, done: string, closeAfter = false) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      setAction(null);
      setReason("");
      onChanged();
      if (closeAfter) onClose();
      else {
        setNotice(done);
        await detail.reload();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={userId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {!d ? (
          detail.error ? <p className="text-sm text-destructive">{detail.error}</p> : <LoadingBlock />
        ) : (
          <>
            <DialogTitle>{d.user.fullName}</DialogTitle>
            <DialogDescription>
              {d.user.email} · joined {formatDay(d.user.createdAt)}
            </DialogDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip tone={d.user.status === "suspended" ? "bad" : "good"}>{d.user.status === "suspended" ? "Suspended" : "Active"}</Chip>
              <Chip tone="brand">{PLAN_NAMES[d.subscription.plan]}{d.subscription.source === "grant" ? " (complimentary)" : ""}</Chip>
              {d.user.role === "admin" && <Chip tone="brand">Admin</Chip>}
              {!d.user.emailVerified && <Chip>Email unverified</Chip>}
            </div>
            {d.user.suspendedReason && <p className="mt-3 rounded-xl bg-red-400/10 p-3 text-sm text-red-200">Suspended: {d.user.suspendedReason}</p>}

            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[
                ["Likes sent", d.activity.likesSent],
                ["Likes received", d.activity.likesReceived],
                ["Matches", d.activity.matches],
                ["Messages sent", d.activity.messagesSent],
                ["Reports against", d.safety.reportsAgainst],
                ["Reports filed", d.safety.reportsFiled],
                ["Times blocked", d.safety.timesBlocked],
                ["Referrals", d.referrals.successful],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <dd className="text-xl font-semibold text-white">{value}</dd>
                  <dt className="text-xs text-white/60">{label}</dt>
                </div>
              ))}
            </dl>

            {d.profile && (
              <p className="mt-4 text-sm text-white/55">
                {d.profile.age}, {d.profile.city} · {d.profile.relationshipGoal}
                {d.aiProfile && <> · AI: {d.aiProfile.personalityType} ({d.aiProfile.confidenceScore}% confidence)</>}
              </p>
            )}

            {d.payments.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-white/60">Recent payments</p>
                <ul className="mt-1.5 text-sm text-white/65">
                  {d.payments.map((p) => (
                    <li key={p.id}>{formatDay(p.paidAt ?? p.createdAt)} — {p.description} — {formatMoney(p.amount, p.currency)} ({p.status})</li>
                  ))}
                </ul>
              </div>
            )}

            {notice && <p role="status" className="mt-4 text-sm text-emerald-300">{notice}</p>}
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="mt-6 border-t border-white/10 pt-5">
              {action === null ? (
                <div className="flex flex-wrap gap-2">
                  {d.user.role !== "admin" &&
                    (d.user.status === "suspended" ? (
                      <Button onClick={() => void run(() => adminUnsuspend(d.user.id), "Account reinstated.")} disabled={busy} className="rounded-full bg-gradient-brand text-white hover:opacity-90">
                        Reinstate account
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => setAction("suspend")} className="rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
                        Suspend…
                      </Button>
                    ))}
                  <Button variant="outline" onClick={() => setAction("grant")} className="rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
                    Grant plan…
                  </Button>
                  {d.subscription.source === "grant" && (
                    <Button variant="ghost" onClick={() => void run(() => adminRevokePlan(d.user.id), "Complimentary plan revoked.")} disabled={busy} className="text-white/60">
                      Revoke complimentary plan
                    </Button>
                  )}
                  {d.user.role !== "admin" && (
                    <Button variant="destructive" onClick={() => setAction("delete")} className="ml-auto rounded-full">
                      Delete account…
                    </Button>
                  )}
                </div>
              ) : action === "suspend" ? (
                <form onSubmit={(e) => { e.preventDefault(); void run(() => adminSuspend(d.user.id, reason.trim()), "Account suspended."); }} className="space-y-3">
                  <p className="text-sm text-white/65">They&apos;ll be signed out immediately and can&apos;t log in. They&apos;re emailed with your reason.</p>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" aria-label="Suspension reason" maxLength={300} />
                  <ActionButtons busy={busy} disabled={reason.trim().length < 3} label="Suspend account" danger onCancel={() => setAction(null)} />
                </form>
              ) : action === "grant" ? (
                <form onSubmit={(e) => { e.preventDefault(); void run(() => adminGrantPlan(d.user.id, plan, Number(days), reason.trim() || undefined), "Plan granted."); }} className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <FilterSelect label="Plan" value={plan} onChange={(e) => setPlan(e.target.value as PaidPlanId)}>
                      <option value="premium">Premium</option>
                      <option value="premium_plus">Premium Plus</option>
                    </FilterSelect>
                    <Input type="number" min={1} max={730} value={days} onChange={(e) => setDays(e.target.value)} aria-label="Days" className="w-28" />
                    <span className="self-center text-sm text-white/60">days</span>
                  </div>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional, e.g. Beta tester)" aria-label="Reason" maxLength={200} />
                  <ActionButtons busy={busy} disabled={!(Number(days) >= 1)} label="Grant plan" onCancel={() => setAction(null)} />
                </form>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); void run(() => adminDeleteUser(d.user.id, confirmEmail.trim()), "", true); }} className="space-y-3">
                  <p className="text-sm text-white/65">
                    This permanently deletes the account, profile, matches, messages and notifications. Payment records are kept for accounting. Type <strong className="text-white">{d.user.email}</strong> to confirm.
                  </p>
                  <Input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder="Type the email to confirm" aria-label="Confirm email" autoComplete="off" />
                  <ActionButtons busy={busy} disabled={confirmEmail.trim().toLowerCase() !== d.user.email.toLowerCase()} label="Delete permanently" danger onCancel={() => setAction(null)} />
                </form>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActionButtons({ busy, disabled, label, danger, onCancel }: { busy: boolean; disabled: boolean; label: string; danger?: boolean; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel} className="text-white/60">
        Back
      </Button>
      <Button type="submit" disabled={busy || disabled} variant={danger ? "destructive" : "default"} className={danger ? "gap-2 rounded-full" : "gap-2 rounded-full bg-gradient-brand text-white hover:opacity-90"}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {label}
      </Button>
    </div>
  );
}
