"use client";

import { useCallback, useRef, useState } from "react";
import { Ban, CheckCircle2, EllipsisVertical, Flag, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useDismiss } from "@/hooks/use-dismiss";
import { blockUser, reportUser } from "@/lib/api/platform";
import { errorMessage } from "@/lib/gate";
import { cn } from "@/lib/utils";
import { REPORT_REASONS, type ReportReason } from "@/types/platform";

interface SafetyMenuProps {
  userId: string;
  userName: string;
  /** Chat context: attached to a report so moderators can see what happened. */
  conversationId?: string;
  /** Called after the person is blocked, so the parent can drop them from the screen. */
  onBlocked?: (userId: string) => void;
  /** Which edge of the button the dropdown lines up with. */
  align?: "left" | "right";
  className?: string;
}

/** "⋮" menu on a person's card or chat header: Report and Block. */
export function SafetyMenu({ userId, userName, conversationId, onBlocked, align = "right", className }: SafetyMenuProps) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"report" | "block" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const firstName = userName.split(" ")[0] ?? userName;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={`Safety options for ${firstName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex size-8 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur transition-colors hover:bg-black/60 hover:text-white focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      >
        <EllipsisVertical className="size-4" />
      </button>

      {open && (
        <div role="menu" className={cn("glass-strong absolute top-full z-30 mt-2 w-48 overflow-hidden rounded-xl p-1 shadow-xl shadow-black/50", align === "left" ? "left-0" : "right-0")}>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); setDialog("report"); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">
            <Flag className="size-4 text-white/50" /> Report {firstName}
          </button>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); setDialog("block"); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-white/10">
            <Ban className="size-4" /> Block {firstName}
          </button>
        </div>
      )}

      <ReportDialog open={dialog === "report"} onOpenChange={(v) => !v && setDialog(null)} userId={userId} userName={userName} conversationId={conversationId} />
      <BlockDialog
        open={dialog === "block"}
        onOpenChange={(v) => !v && setDialog(null)}
        userId={userId}
        userName={userName}
        onBlocked={() => {
          setDialog(null);
          onBlocked?.(userId);
        }}
      />
    </div>
  );
}

function ReportDialog({ open, onOpenChange, userId, userName, conversationId }: { open: boolean; onOpenChange: (v: boolean) => void; userId: string; userName: string; conversationId?: string }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setTimeout(() => {
        setReason(null);
        setDetails("");
        setError(null);
        setDone(false);
      }, 200);
    }
  }

  async function submit() {
    if (!reason) return;
    setIsSending(true);
    setError(null);
    try {
      await reportUser({ userId, reason, details: details.trim() || undefined, conversationId });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent>
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="size-10 text-accent" />
            <DialogTitle className="pr-0">Thanks — we&apos;re on it</DialogTitle>
            <DialogDescription>Our moderators will review your report. You can also block {userName} so you don&apos;t see each other.</DialogDescription>
            <DialogClose asChild>
              <Button className="mt-2 rounded-full bg-gradient-brand text-white hover:opacity-90">Done</Button>
            </DialogClose>
          </div>
        ) : (
          <>
            <DialogTitle>Report {userName}</DialogTitle>
            <DialogDescription>Reports are confidential. {userName} won&apos;t be told who reported them.</DialogDescription>

            <fieldset className="mt-5 space-y-2">
              <legend className="sr-only">Reason</legend>
              {REPORT_REASONS.map((r) => (
                <label key={r.value} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors", reason === r.value ? "border-primary/60 bg-primary/10 text-white" : "border-white/10 text-white/70 hover:bg-white/5")}>
                  <input type="radio" name="report-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-[var(--primary)]" />
                  {r.label}
                </label>
              ))}
            </fieldset>

            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} placeholder="Anything else we should know? (optional)" aria-label="Additional details" className="mt-4 min-h-20" />

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline" className="rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">Cancel</Button>
              </DialogClose>
              <Button onClick={() => void submit()} disabled={!reason || isSending} className="gap-2 rounded-full bg-gradient-brand text-white hover:opacity-90">
                {isSending && <Loader2 className="size-4 animate-spin" />}
                Send report
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BlockDialog({ open, onOpenChange, userId, userName, onBlocked }: { open: boolean; onOpenChange: (v: boolean) => void; userId: string; userName: string; onBlocked: () => void }) {
  const [isBlocking, setIsBlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setIsBlocking(true);
    setError(null);
    try {
      await blockUser(userId);
      onBlocked();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsBlocking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Block {userName}?</DialogTitle>
        <DialogDescription>
          You won&apos;t see each other in Discover or recommendations, and neither of you can like or message the other. Any match or conversation between you will be hidden. You can unblock them any time in Settings.
        </DialogDescription>
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" className="rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">Cancel</Button>
          </DialogClose>
          <Button onClick={() => void confirm()} disabled={isBlocking} variant="destructive" className="gap-2 rounded-full">
            {isBlocking && <Loader2 className="size-4 animate-spin" />}
            Block {userName.split(" ")[0]}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
