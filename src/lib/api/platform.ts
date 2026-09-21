import { apiFetch } from "@/lib/api-client";
import type {
  AdminOverview, AdminRates, AdminReportDetail, AdminReportList, AdminRevenue, AdminUserDetail, AdminUserRow,
  AppNotification, AuditEntry, BillingInterval, BillingOverview, BlockedUser, BoostStatus, DeepAnalysisResponse,
  EmailLogEntry, FeatureFlag, FunnelStep, LikeAllowance, NotificationPage, PaidPlanId, PaymentRecord, Pagination,
  PlanCatalog, PublicFeatures, ReadReceiptInsights, ReferralSummary, ReportReason, ResolveAction, SystemInfo,
  Timeseries, TimeseriesMetric, UserFeatures, UserSettings, WaitlistEntry,
} from "@/types/platform";

const post = <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body });
const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
};

// ---- features ---------------------------------------------------------------
export const getPublicFeatures = () => apiFetch<PublicFeatures>("/features/public", { auth: false });
export const getUserFeatures = () => apiFetch<UserFeatures>("/features");

// ---- notifications ----------------------------------------------------------
export const getNotifications = (opts: { page?: number; limit?: number; unreadOnly?: boolean } = {}) =>
  apiFetch<NotificationPage>(`/notifications${qs({ page: opts.page, limit: opts.limit, unreadOnly: opts.unreadOnly ? "true" : undefined })}`);
export const getUnreadCount = () => apiFetch<{ unreadCount: number }>("/notifications/unread-count");
export const markNotificationRead = (id: string) => post<{ notification: AppNotification }>(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => post<{ updated: number }>("/notifications/read-all");
export const deleteNotification = (id: string) => apiFetch<null>(`/notifications/${id}`, { method: "DELETE" });

// ---- account -----------------------------------------------------------------
export const verifyEmail = (token: string) => apiFetch<{ verified: boolean }>("/account/verify-email", { method: "POST", body: { token }, auth: false });
export const resendVerification = () => post<{ alreadyVerified: boolean }>("/account/resend-verification");
export const getSettings = () => apiFetch<{ settings: UserSettings }>("/account/settings");
export const updateSettings = (patch: { notifications?: Partial<UserSettings["notifications"]>; email?: Partial<UserSettings["email"]> }) =>
  apiFetch<{ settings: UserSettings }>("/account/settings", { method: "PUT", body: patch });
export const unsubscribe = (token: string) => apiFetch<{ scope: string }>("/account/unsubscribe", { method: "POST", body: { token }, auth: false });

// ---- billing -----------------------------------------------------------------
export const getPlans = () => apiFetch<PlanCatalog>("/billing/plans", { auth: false });
export const getBillingOverview = () => apiFetch<BillingOverview>("/billing/overview");
export const startCheckout = (plan: PaidPlanId, interval: BillingInterval) => post<{ url: string; provider: string }>("/billing/checkout", { plan, interval });
export const upgradePlan = (plan: PaidPlanId) => post<{ subscription: BillingOverview["subscription"] }>("/billing/upgrade", { plan });
export const cancelSubscription = () => post<{ subscription: BillingOverview["subscription"] }>("/billing/cancel");
export const getPayments = (page = 1) => apiFetch<{ payments: PaymentRecord[]; pagination: Pagination }>(`/billing/payments?page=${page}&limit=20`);
export const completeMockCheckout = (session: string) => post<{ subscription: BillingOverview["subscription"] }>("/billing/mock/complete", { session });

// ---- premium perks ---------------------------------------------------------------
export const getLikeAllowance = () => apiFetch<{ allowance: LikeAllowance }>("/premium/likes/allowance");
export const getBoost = () => apiFetch<{ boost: BoostStatus }>("/premium/boost");
export const activateBoost = () => post<{ boost: BoostStatus }>("/premium/boost");
export const getDeepAnalysis = () => apiFetch<DeepAnalysisResponse>("/premium/deep-analysis");
export const generateDeepAnalysis = (force = false) => post<DeepAnalysisResponse>(`/premium/deep-analysis${force ? "?force=true" : ""}`);
export const getReadReceipts = () => apiFetch<ReadReceiptInsights>("/premium/read-receipts");

// ---- safety -------------------------------------------------------------------------
export const reportUser = (input: { userId: string; reason: ReportReason; details?: string; conversationId?: string; messageId?: string }) =>
  post<{ reportId: string }>("/safety/reports", input);
export const getBlocks = () => apiFetch<{ blocks: BlockedUser[] }>("/safety/blocks");
export const blockUser = (userId: string) => post<{ userId: string }>("/safety/blocks", { userId });
export const unblockUser = (userId: string) => apiFetch<{ userId: string }>(`/safety/blocks/${userId}`, { method: "DELETE" });

// ---- growth --------------------------------------------------------------------------
export const getReferrals = () => apiFetch<ReferralSummary>("/growth/referrals");
export const sendInvites = (emails: string[]) => post<{ submitted: number }>("/growth/referrals/invite", { emails });
export const joinWaitlist = (email: string, referralCode?: string) =>
  apiFetch<{ position: number; alreadyOnList: boolean }>("/growth/waitlist", { method: "POST", body: { email, referralCode }, auth: false });
export const recordProfileView = (userId: string) => post<{ recorded: boolean }>(`/growth/profile-views/${userId}`);

// ---- admin -----------------------------------------------------------------------------
export const adminOverview = () => apiFetch<AdminOverview>("/admin/overview");
export const adminRates = () => apiFetch<AdminRates>("/admin/analytics/rates");
export const adminFunnel = () => apiFetch<{ steps: FunnelStep[] }>("/admin/analytics/funnel");
export const adminRevenue = () => apiFetch<AdminRevenue>("/admin/analytics/revenue");
export const adminTimeseries = (metric: TimeseriesMetric, days: number) => apiFetch<Timeseries>(`/admin/analytics/timeseries${qs({ metric, days })}`);
export const adminSystem = () => apiFetch<SystemInfo>("/admin/system");

export const adminUsers = (opts: { query?: string; status?: string; role?: string; plan?: string; page?: number; limit?: number }) =>
  apiFetch<{ users: AdminUserRow[]; pagination: Pagination }>(`/admin/users${qs(opts)}`);
export const adminUser = (id: string) => apiFetch<AdminUserDetail>(`/admin/users/${id}`);
export const adminSuspend = (id: string, reason: string) => post<null>(`/admin/users/${id}/suspend`, { reason });
export const adminUnsuspend = (id: string) => post<null>(`/admin/users/${id}/unsuspend`);
export const adminDeleteUser = (id: string, confirmEmail: string) => post<{ deletedMessages: number }>(`/admin/users/${id}/delete`, { confirmEmail });
export const adminGrantPlan = (id: string, plan: PaidPlanId, days: number, reason?: string) => post<null>(`/admin/users/${id}/plan`, { plan, days, reason });
export const adminRevokePlan = (id: string) => apiFetch<null>(`/admin/users/${id}/plan`, { method: "DELETE" });

export const adminReports = (opts: { status?: string; page?: number; limit?: number }) => apiFetch<AdminReportList>(`/admin/reports${qs(opts)}`);
export const adminReport = (id: string) => apiFetch<AdminReportDetail>(`/admin/reports/${id}`);
export const adminReviewReport = (id: string) => post<null>(`/admin/reports/${id}/review`);
export const adminResolveReport = (id: string, action: ResolveAction, note: string) => post<unknown>(`/admin/reports/${id}/resolve`, { action, note });

export const adminFlags = () => apiFetch<{ flags: FeatureFlag[] }>("/admin/feature-flags");
export const adminSetFlag = (key: string, enabled: boolean) => apiFetch<{ flags: FeatureFlag[] }>(`/admin/feature-flags/${key}`, { method: "PUT", body: { enabled } });
export const adminResetFlag = (key: string) => apiFetch<{ flags: FeatureFlag[] }>(`/admin/feature-flags/${key}`, { method: "DELETE" });

export const adminAudit = (page = 1) => apiFetch<{ entries: AuditEntry[]; pagination: Pagination }>(`/admin/audit-log?page=${page}&limit=30`);
export const adminEmailLog = (status?: string, page = 1) => apiFetch<{ entries: EmailLogEntry[]; pagination: Pagination }>(`/admin/email-log${qs({ status, page, limit: 30 })}`);
export const adminRunJob = (name: string) => post<{ result: { status: string } }>(`/admin/jobs/${name}/run?force=true`);

export const adminWaitlist = (status?: string) => apiFetch<{ entries: WaitlistEntry[]; pagination: Pagination }>(`/admin/waitlist${qs({ status, limit: 50 })}`);
export const adminInviteNext = (count: number) => post<{ invited: number }>("/admin/waitlist/invite-next", { count });
export const adminInviteEntry = (id: string) => post<null>(`/admin/waitlist/${id}/invite`);

// ---- client error reporting (error boundaries) -----------------------------------------------
export const reportClientError = (body: { message: string; digest?: string; stack?: string; path?: string; userAgent?: string }) =>
  apiFetch<null>("/client-errors", { method: "POST", body, auth: false });
