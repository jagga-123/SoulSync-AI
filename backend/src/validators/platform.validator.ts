import { z } from "zod";
import { BILLING_INTERVALS, PAID_PLAN_IDS, PLAN_IDS } from "../features/plans";
import { isFeatureKey } from "../features/registry";
import { REPORT_REASONS } from "../models/Report.model";
import { TIMESERIES_METRICS } from "../services/analytics.service";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");
const page = z.coerce.number().int().min(1).default(1);
const limit = (max: number, fallback: number) => z.coerce.number().int().min(1).max(max).default(fallback);
const email = z.string().trim().toLowerCase().email("Please provide a valid email").max(254);

// ---- notifications / account ---------------------------------------------

export const notificationListQuery = z.object({
  page,
  limit: limit(50, 20),
  unreadOnly: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});

export const settingsBody = z
  .object({
    notifications: z
      .object({
        like: z.boolean(),
        match: z.boolean(),
        message: z.boolean(),
        profileView: z.boolean(),
        aiRecommendation: z.boolean(),
      })
      .partial()
      .optional(),
    email: z
      .object({ matches: z.boolean(), messages: z.boolean(), weeklyReport: z.boolean(), referrals: z.boolean() })
      .partial()
      .optional(),
  })
  .strict();

export const tokenBody = z.object({ token: z.string().min(10).max(600) });

// ---- billing --------------------------------------------------------------

export const checkoutBody = z.object({
  plan: z.enum(PAID_PLAN_IDS, { errorMap: () => ({ message: "Choose premium or premium_plus" }) }),
  interval: z.enum(BILLING_INTERVALS).default("monthly"),
});
export const upgradeBody = z.object({ plan: z.enum(PAID_PLAN_IDS) });
export const mockCompleteBody = z.object({ session: z.string().min(10).max(2000) });
export const paymentsQuery = z.object({ page, limit: limit(50, 20) });

// ---- safety ---------------------------------------------------------------

export const reportBody = z.object({
  userId: objectId,
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional(),
  conversationId: objectId.optional(),
  messageId: objectId.optional(),
});
export const blockBody = z.object({ userId: objectId });

// ---- growth ---------------------------------------------------------------

export const inviteBody = z.object({ emails: z.array(email).min(1).max(5) });
export const waitlistBody = z.object({ email, referralCode: z.string().trim().max(20).optional() });

// ---- admin ----------------------------------------------------------------

export const adminUsersQuery = z.object({
  query: z.string().trim().max(100).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  role: z.enum(["user", "admin"]).optional(),
  plan: z.enum(PLAN_IDS).optional(),
  page,
  limit: limit(100, 20),
});
export const suspendBody = z.object({ reason: z.string().trim().min(3, "Give a reason").max(300) });
export const deleteUserBody = z.object({ confirmEmail: email });
export const grantPlanBody = z.object({
  plan: z.enum(PAID_PLAN_IDS),
  days: z.coerce.number().int().min(1).max(730),
  reason: z.string().trim().min(3).max(200).default("Granted by an administrator"),
});
export const flagBody = z.object({ enabled: z.boolean() });
export const featureKeyParam = z.string().refine(isFeatureKey, "Unknown feature flag");
export const reportsQuery = z.object({
  status: z.enum(["open", "pending", "reviewing", "resolved", "dismissed", "all"]).default("open"),
  page,
  limit: limit(50, 20),
});
export const resolveReportBody = z.object({
  action: z.enum(["dismiss", "warn", "suspend", "delete_user", "hide_message"]),
  note: z.string().trim().max(1000).default(""),
});
export const timeseriesQuery = z.object({
  metric: z.enum(TIMESERIES_METRICS),
  days: z.coerce.number().int().min(7).max(90).default(30),
});
export const auditQuery = z.object({ page, limit: limit(100, 30) });
export const waitlistAdminQuery = z.object({
  status: z.enum(["waiting", "invited", "joined"]).optional(),
  page,
  limit: limit(100, 30),
});
export const inviteNextBody = z.object({ count: z.coerce.number().int().min(1).max(100) });
export const emailLogQuery = z.object({ status: z.enum(["sent", "failed", "skipped"]).optional(), page, limit: limit(100, 30) });

// ---- misc -----------------------------------------------------------------

export const clientErrorBody = z.object({
  message: z.string().max(500),
  digest: z.string().max(100).optional(),
  stack: z.string().max(4000).optional(),
  path: z.string().max(300).optional(),
  userAgent: z.string().max(300).optional(),
});

// ---- discover (advanced filters) -----------------------------------------

export const advancedDiscoverQuery = z.object({
  ageMin: z.coerce.number().int().min(18).max(120).optional(),
  ageMax: z.coerce.number().int().min(18).max(120).optional(),
  gender: z.enum(["male", "female", "non-binary", "other"]).optional(),
  interests: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 10))
    .optional(),
});
