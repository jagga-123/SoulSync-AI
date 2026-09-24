"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CreditCard, ExternalLink, Gift, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AppPage, Section } from "@/components/platform/app-page";
import { usePlatform } from "@/components/platform/platform-provider";
import { cancelSubscription, getBillingOverview, getPayments } from "@/lib/api/platform";
import { errorMessage, formatMoney } from "@/lib/gate";
import { cn } from "@/lib/utils";
import type { BillingOverview, PaymentRecord } from "@/types/platform";

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—";

export function BillingView() {
  return (
    <AppPage title="Plan & billing" description="Your subscription, receipts and payment history." width="narrow">
      {() => <Billing />}
    </AppPage>
  );
}

function Billing() {
  const params = useSearchParams();
  const { refreshFeatures } = usePlatform();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const justPaid = params.get("checkout") === "success";

  const load = useCallback(async () => {
    try {
      const [o, p] = await Promise.all([getBillingOverview(), getPayments()]);
      setOverview(o);
      setPayments(p.payments);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load your billing details."));
    }
  }, []);

  useEffect(() => {
    void load();
    if (justPaid) void refreshFeatures();
  }, [load, justPaid, refreshFeatures]);

  async function cancel() {
    setIsCancelling(true);
    setError(null);
    try {
      await cancelSubscription();
      setConfirmOpen(false);
      await Promise.all([load(), refreshFeatures()]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsCancelling(false);
    }
  }

  if (!overview) {
    return error ? (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    ) : (
      <div className="flex justify-center py-20 text-white/60">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const sub = overview.subscription;
  const isFree = sub.plan === "free";
  const isPaid = sub.source === "paid";
  const ending = sub.cancelAtPeriodEnd;

  return (
    <div className="space-y-6">
      {justPaid && !isFree && (
        <Alert>
          <CheckCircle2 />
          <AlertDescription>Payment received — welcome to {sub.planName}! Your new features are active.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-white/60">Current plan</p>
            <p className="mt-1 font-display text-3xl font-semibold text-white">{sub.planName}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill status={ending ? "ending" : sub.status} />
              {sub.source === "grant" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                  <Gift className="size-3" /> Complimentary
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="rounded-full bg-gradient-brand text-white hover:opacity-90">
              <Link href="/pricing">{isFree ? "See plans" : "Change plan"}</Link>
            </Button>
          </div>
        </div>

        {!isFree && (
          <dl className="mt-6 grid gap-4 border-t border-white/10 pt-5 text-sm sm:grid-cols-3">
            <Detail label={ending ? "Access until" : sub.source === "grant" ? "Complimentary until" : "Renews on"} value={formatDate(sub.expiryDate)} />
            <Detail label="Billing" value={sub.billingInterval ? (sub.billingInterval === "yearly" ? "Yearly" : "Monthly") : "—"} />
            <Detail label="Started" value={formatDate(sub.startDate)} />
          </dl>
        )}

        {sub.status === "past_due" && (
          <p role="alert" className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            Your last payment didn&apos;t go through. Update your payment method with your provider to keep {sub.planName}.
          </p>
        )}
        {ending && (
          <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/65">
            Your subscription is cancelled. You keep {sub.planName} until {formatDate(sub.expiryDate)} and won&apos;t be charged again.
          </p>
        )}

        {isPaid && !ending && sub.status !== "expired" && (
          <div className="mt-6 border-t border-white/10 pt-5">
            <Button variant="ghost" onClick={() => setConfirmOpen(true)} className="text-white/55 hover:text-destructive">
              Cancel subscription
            </Button>
          </div>
        )}
      </Section>

      <Section title="Payment history" description="Receipts for every charge on your account.">
        {payments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-white/60">
            <CreditCard className="size-6" />
            <p className="text-sm">No payments yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-white/60">
                <tr>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Description</th>
                  <th className="pb-3 text-right font-medium">Amount</th>
                  <th className="pb-3 pl-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 text-white/60">{formatDate(p.paidAt ?? p.createdAt)}</td>
                    <td className="py-3 text-white">
                      {p.description}
                      {p.receiptUrl && (
                        <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-xs text-accent hover:underline">
                          Receipt <ExternalLink className="size-3" />
                        </a>
                      )}
                    </td>
                    <td className="py-3 text-right tabular-nums text-white">{formatMoney(p.amount, p.currency)}</td>
                    <td className="py-3 pl-4">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs capitalize", p.status === "succeeded" ? "bg-accent/10 text-accent" : p.status === "failed" ? "bg-destructive/15 text-destructive" : "bg-white/10 text-white/60")}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogTitle>Cancel your subscription?</DialogTitle>
          <DialogDescription>
            You&apos;ll keep {sub.planName} until {formatDate(sub.expiryDate)}. After that you&apos;ll move to the Free plan and won&apos;t be charged again.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline" className="rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
                Keep my plan
              </Button>
            </DialogClose>
            <Button onClick={() => void cancel()} disabled={isCancelling} variant="destructive" className="gap-2 rounded-full">
              {isCancelling && <Loader2 className="size-4 animate-spin" />}
              Cancel subscription
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-white/60">{label}</dt>
      <dd className="mt-0.5 font-medium text-white">{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    free: { label: "Free", className: "bg-white/10 text-white/60" },
    active: { label: "Active", className: "bg-accent/10 text-accent" },
    trialing: { label: "Trial", className: "bg-accent/10 text-accent" },
    past_due: { label: "Payment failed", className: "bg-destructive/15 text-destructive" },
    canceled: { label: "Cancelled", className: "bg-white/10 text-white/60" },
    ending: { label: "Ends at period end", className: "bg-primary/15 text-primary" },
    expired: { label: "Expired", className: "bg-white/10 text-white/50" },
  };
  const { label, className } = map[status] ?? map.free!;
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", className)}>{label}</span>;
}
