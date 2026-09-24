"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Send } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminHeading, LoadingBlock } from "@/components/admin/admin-shell";
import { Chip, DataTable, Td, Th, formatDateTime } from "@/components/admin/admin-ui";
import { useApi } from "@/hooks/use-api";
import { adminInviteEntry, adminInviteNext, adminWaitlist, getPublicFeatures } from "@/lib/api/platform";
import { errorMessage } from "@/lib/gate";
import { cn } from "@/lib/utils";

const TABS = [
  { value: "waiting", label: "Waiting" },
  { value: "invited", label: "Invited" },
  { value: "joined", label: "Joined" },
] as const;

export function WaitlistAdminView() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("waiting");
  const [count, setCount] = useState("10");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useApi(() => adminWaitlist(tab), [tab]);
  const features = useApi(getPublicFeatures);

  async function inviteNext(event: FormEvent) {
    event.preventDefault();
    setBusy("next");
    setError(null);
    setNotice(null);
    try {
      const { invited } = await adminInviteNext(Number(count));
      setNotice(`Invited ${invited} ${invited === 1 ? "person" : "people"}.`);
      await list.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function inviteOne(id: string) {
    setBusy(id);
    setError(null);
    try {
      await adminInviteEntry(id);
      await list.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <AdminHeading title="Waitlist" description="People waiting for access. Invite them in batches to control growth." />

      {features.data && (
        <p role="status" className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/65">
          Registration is currently <strong className="text-white">{features.data.waitlistMode ? "invite-only" : "open to everyone"}</strong>.{" "}
          {features.data.waitlistMode ? "Only invited people and referred friends can sign up." : "Turn on “Waitlist mode” under Feature flags to require an invite."}
        </p>
      )}

      <form onSubmit={inviteNext} className="glass mb-6 flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <span className="text-sm text-white/65">Invite the next</span>
        <Input type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} aria-label="How many people" className="w-24" />
        <span className="text-sm text-white/65">people in line</span>
        <Button type="submit" disabled={busy === "next" || !(Number(count) >= 1)} className="ml-auto gap-2 rounded-full bg-gradient-brand text-white hover:opacity-90">
          {busy === "next" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send invites
        </Button>
      </form>

      {notice && <p role="status" className="mb-3 text-sm text-emerald-300">{notice}</p>}
      {(error || list.error) && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error ?? list.error}</AlertDescription>
        </Alert>
      )}

      <div role="tablist" aria-label="Waitlist status" className="mb-4 flex gap-1.5">
        {TABS.map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)} className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition-colors", tab === t.value ? "border-transparent bg-gradient-brand text-white" : "border-white/10 text-white/60 hover:text-white")}>
            {t.label}
          </button>
        ))}
      </div>

      {list.isLoading && !list.data ? (
        <LoadingBlock />
      ) : (
        <DataTable minWidth="32rem">
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Email</Th>
              <Th>Joined the list</Th>
              <Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {list.data?.entries.map((entry) => (
              <tr key={entry.id}>
                <Td className="tabular-nums text-white/60">{entry.position}</Td>
                <Td className="text-white">
                  {entry.email} {entry.status !== "waiting" && <Chip tone={entry.status === "joined" ? "good" : "brand"}>{entry.status}</Chip>}
                </Td>
                <Td className="text-white/55">{formatDateTime(entry.createdAt)}</Td>
                <Td className="text-right">
                  {entry.status !== "joined" && (
                    <Button size="sm" variant="outline" disabled={busy === entry.id} onClick={() => void inviteOne(entry.id)} className="rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
                      {entry.status === "invited" ? "Resend invite" : "Invite"}
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
            {list.data?.entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-white/60">
                  Nobody here.
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
