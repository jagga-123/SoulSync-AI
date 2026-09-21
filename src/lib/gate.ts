import { ApiClientError } from "@/lib/api-client";
import type { PlanId } from "@/types/platform";

/**
 * Paywall / feature-flag responses from the API carry a machine-readable
 * `error.code`. This turns them into something a component can branch on.
 */
export type Gate =
  | { kind: "upgrade"; feature?: string; requiredPlan: PlanId; message: string }
  | { kind: "like-limit"; limit: number; used: number; resetsAt?: string; message: string }
  | { kind: "disabled"; feature?: string; message: string }
  | { kind: "waitlist"; message: string }
  | { kind: "suspended"; message: string };

interface GateDetails {
  code?: string;
  feature?: string;
  requiredPlan?: PlanId;
  limit?: number;
  used?: number;
  resetsAt?: string;
}

export function gateOf(err: unknown): Gate | null {
  if (!(err instanceof ApiClientError)) return null;
  const d = (err.details ?? {}) as GateDetails;
  switch (d.code) {
    case "UPGRADE_REQUIRED":
      return { kind: "upgrade", feature: d.feature, requiredPlan: d.requiredPlan ?? "premium", message: err.message };
    case "LIKE_LIMIT_REACHED":
      return { kind: "like-limit", limit: d.limit ?? 0, used: d.used ?? 0, resetsAt: d.resetsAt, message: err.message };
    case "FEATURE_DISABLED":
      return { kind: "disabled", feature: d.feature, message: err.message };
    case "WAITLIST_REQUIRED":
      return { kind: "waitlist", message: err.message };
    case "ACCOUNT_SUSPENDED":
      return { kind: "suspended", message: err.message };
    default:
      return null;
  }
}

export const errorMessage = (err: unknown, fallback = "Something went wrong. Please try again.") =>
  err instanceof ApiClientError ? err.message : fallback;

export const PLAN_NAMES: Record<PlanId, string> = { free: "Free", premium: "Premium", premium_plus: "Premium Plus" };

/** Minor units (cents / paise) → "$9.99" / "₹799". */
export function formatMoney(minor: number, currency: string): string {
  const amount = minor / 100;
  return new Intl.NumberFormat(currency.toLowerCase() === "inr" ? "en-IN" : "en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}
