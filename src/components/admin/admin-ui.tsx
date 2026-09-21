"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FilterSelect({ label, className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <select
      aria-label={label}
      className={cn("h-9 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-sm text-white outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 [&>option]:bg-[#0b1026]", className)}
      {...props}
    >
      {children}
    </select>
  );
}

const CHIP_TONES = {
  neutral: "bg-white/10 text-white/65",
  good: "bg-emerald-400/15 text-emerald-300",
  warn: "bg-amber-400/15 text-amber-300",
  bad: "bg-red-400/15 text-red-300",
  brand: "bg-primary/15 text-primary",
} as const;

/** Status is always icon-free text + tone, never colour alone. */
export function Chip({ tone = "neutral", children }: { tone?: keyof typeof CHIP_TONES; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", CHIP_TONES[tone])}>{children}</span>;
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm text-white/55">
      <span>
        Page {page} of {totalPages}
      </span>
      <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)} className="border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
        <ChevronLeft />
      </Button>
      <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
        <ChevronRight />
      </Button>
    </div>
  );
}

export function DataTable({ children, minWidth = "40rem" }: { children: ReactNode; minWidth?: string }) {
  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th className={cn("px-4 py-3 text-xs font-medium uppercase tracking-wider text-white/40", className)}>{children}</th>
);
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cn("px-4 py-3 text-white/75", className)}>{children}</td>;

export const formatDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
export const formatDay = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
