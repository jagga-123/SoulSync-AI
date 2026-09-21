// Phase 6 API types — notifications, plans & billing, premium perks, safety,
// growth and the admin dashboard. They mirror the backend's response shapes.

export type PlanId = "free" | "premium" | "premium_plus";
export type PaidPlanId = Exclude<PlanId, "free">;
export type BillingInterval = "monthly" | "yearly";

// ---- notifications ---------------------------------------------------------

export type NotificationType =
  | "like_received"
  | "match_created"
  | "message_received"
  | "profile_viewed"
  | "ai_recommendation"
  | "subscription"
  | "referral"
  | "safety"
  | "system";

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  metadata: Record<string, unknown> & { count?: number; link?: string; conversationId?: string };
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPage {
  notifications: AppNotification[];
  unreadCount: number;
  pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
}

// ---- features, plans, billing ------------------------------------------------

export type PerkKey =
  | "unlimited_likes"
  | "advanced_filters"
  | "priority_recommendations"
  | "profile_boost"
  | "ai_deep_analysis"
  | "read_receipts_insights";

export interface PerkState {
  enabled: boolean;
  included: boolean;
  available: boolean;
}

export interface LikeAllowance {
  enforced: boolean;
  unlimited: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
}

export interface UserFeatures {
  flags: Record<string, boolean>;
  plan: PlanId;
  perks: Record<PerkKey, PerkState>;
  limits: { dailyLikes: number | null; recommendations: number; monthlyBoosts: number };
  likeAllowance: LikeAllowance;
}

export interface PublicFeatures {
  waitlistMode: boolean;
  billing: boolean;
  referrals: boolean;
}

export interface PlanPerk {
  key: PerkKey;
  label: string;
  description: string;
  live: boolean;
}

export interface PlanInfo {
  id: PlanId;
  name: string;
  tagline: string;
  prices: { monthly: number; yearly: number };
  perks: PlanPerk[];
  limits: { dailyLikes: number | null; recommendations: number; monthlyBoosts: number };
}

export interface PlanCatalog {
  billingEnabled: boolean;
  provider: "stripe" | "razorpay" | "mock" | null;
  currency: "usd" | "inr";
  plans: PlanInfo[];
}

export interface SubscriptionView {
  plan: PlanId;
  planName: string;
  status: "free" | "active" | "past_due" | "canceled" | "expired" | "trialing";
  source: "paid" | "grant" | null;
  provider: string | null;
  billingInterval: BillingInterval | null;
  startDate: string | null;
  expiryDate: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingOverview extends PlanCatalog {
  subscription: SubscriptionView;
}

export interface PaymentRecord {
  id: string;
  provider: string;
  plan: PlanId;
  interval?: BillingInterval;
  amount: number;
  currency: string;
  status: "succeeded" | "failed" | "refunded" | "pending";
  description: string;
  receiptUrl?: string;
  paidAt?: string;
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---- premium perks -------------------------------------------------------------

export interface BoostStatus {
  featureEnabled: boolean;
  included: boolean;
  active: boolean;
  endsAt: string | null;
  quota: number;
  usedThisMonth: number;
  remaining: number;
  durationMinutes: number;
}

export interface DeepAnalysisData {
  idealPartner: { summary: string; qualities: string[]; complementaryTraits: string[] };
  communicationTips: string[];
  growthAreas: string[];
  relationshipPitfalls: string[];
  conversationStarters: string[];
  datingStrategy: string;
  source: "llm" | "heuristic";
  provider: string | null;
  generatedAt: string;
}

export interface DeepAnalysisResponse {
  analysis: DeepAnalysisData | null;
  stale: boolean;
  hasAIProfile: boolean;
}

export interface ReadReceiptInsights {
  totals: { sent: number; read: number; unread: number; readRate: number | null; medianReadSeconds: number | null };
  partners: Array<{ userId: string; name: string; sent: number; read: number; readRate: number; medianReadSeconds: number | null }>;
  readsByHourUtc: Array<{ hour: number; reads: number }>;
  sampleSize: number;
}

// ---- account, settings -----------------------------------------------------------

export interface NotificationPrefs {
  like: boolean;
  match: boolean;
  message: boolean;
  profileView: boolean;
  aiRecommendation: boolean;
}

export interface EmailPrefs {
  matches: boolean;
  messages: boolean;
  weeklyReport: boolean;
  referrals: boolean;
}

export interface UserSettings {
  notifications: NotificationPrefs;
  email: EmailPrefs;
}

// ---- safety -----------------------------------------------------------------------

export const REPORT_REASONS = [
  { value: "harassment", label: "Harassment or abuse" },
  { value: "inappropriate_content", label: "Inappropriate content" },
  { value: "scam", label: "Scam or asking for money" },
  { value: "fake_profile", label: "Fake profile" },
  { value: "spam", label: "Spam" },
  { value: "underage", label: "Seems underage" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export interface BlockedUser {
  user: { id: string; fullName: string; age: number; city: string; profileImage?: string };
  blockedAt: string;
}

// ---- growth -------------------------------------------------------------------------

export interface ReferralSummary {
  code: string;
  link: string;
  counts: { invited: number; successful: number; pending: number };
  rewardsEnabled: boolean;
  tiers: Array<{ threshold: number; label: string; achieved: boolean; granted: boolean }>;
  nextTier: { threshold: number; plan: string; days: number; label: string } | null;
  recent: Array<{ name: string; status: "pending" | "qualified"; joinedAt: string }>;
}

// ---- admin -----------------------------------------------------------------------------

export interface AdminOverview {
  users: { total: number; active24h: number; active7d: number; active30d: number; new7d: number; new30d: number; suspended: number; emailVerified: number };
  matches: { total: number; last7d: number };
  messages: { total: number; last7d: number };
  likes: { total: number; accepted: number };
  interviews: { completed: number };
  premium: { subscribers: number; byPlan: { premium: number; premium_plus: number }; newLast30d: number; mrrUsd: number };
  moderation: { pendingReports: number };
  generatedAt: string;
}

export interface AdminRates {
  interviewStartRate: number | null;
  interviewCompletionRate: number | null;
  interviewFinishRate: number | null;
  matchRate: number | null;
  likeToMatchRate: number | null;
  conversationRate: number | null;
  messagesPerActiveUser7d: number | null;
  premiumConversion: number | null;
  counts: Record<string, number>;
}

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  fromPrevious: number | null;
  fromStart: number | null;
}

export const TIMESERIES_METRICS = ["registrations", "matches", "messages", "likes", "interviews", "premium"] as const;
export type TimeseriesMetric = (typeof TIMESERIES_METRICS)[number];

export interface Timeseries {
  metric: TimeseriesMetric;
  days: number;
  total: number;
  points: Array<{ date: string; value: number }>;
}

export interface AdminRevenue {
  days: number;
  byCurrency: Array<{ currency: string; amountMinor: number; payments: number }>;
}

export interface AdminUserRow {
  id: string;
  fullName: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  emailVerified: boolean;
  plan: PlanId;
  createdAt: string;
  lastActiveAt?: string;
  suspendedReason?: string;
}

export interface AdminUserDetail {
  user: AdminUserRow;
  profile: { age: number; gender: string; city: string; bio: string; interests: string[]; relationshipGoal: string } | null;
  aiProfile: { personalityType: string; communicationStyle: string; confidenceScore: number; analysisSource: string } | null;
  subscription: SubscriptionView;
  activity: { likesSent: number; likesReceived: number; matches: number; messagesSent: number };
  safety: { reportsAgainst: number; reportsFiled: number; timesBlocked: number };
  referrals: { successful: number };
  payments: PaymentRecord[];
}

export type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed";

export interface AdminReport {
  id: string;
  status: ReportStatus;
  reason: string;
  details: string;
  context?: { conversationId?: string; messageId?: string };
  resolution?: { action: string; note: string; resolvedAt: string };
  reporter: { id: string; fullName: string; email: string } | null;
  reported: { id: string; fullName: string; email: string; status: string } | null;
  distinctReporters: number;
  createdAt: string;
}

export interface AdminReportList {
  reports: AdminReport[];
  pagination: Pagination;
  counts: Partial<Record<ReportStatus, number>>;
}

export interface AdminReportDetail {
  report: AdminReport;
  reporter: { id: string; fullName: string; email: string } | null;
  reported: { id: string; fullName: string; email: string; status: string; suspendedReason?: string; createdAt: string } | null;
  reportedProfile: { fullName: string; age: number; city: string; bio: string } | null;
  messages: Array<{ id: string; content: string; createdAt: string; isReported: boolean; isHidden: boolean }>;
  otherReportsAgainstUser: number;
}

export type ResolveAction = "dismiss" | "warn" | "suspend" | "delete_user" | "hide_message";

export interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  category: "core" | "premium" | "growth" | "safety";
  enabled: boolean;
  defaultEnabled: boolean;
  source: "database" | "env" | "default";
}

export interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface EmailLogEntry {
  id: string;
  to: string;
  template: string;
  subject: string;
  provider: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
  createdAt: string;
}

export interface JobStatus {
  name: string;
  intervalMs: number;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
}

export interface SystemInfo {
  uptimeSeconds: number;
  node: string;
  environment: string;
  memoryMb: number;
  database: { connected: boolean };
  socketConnections: number;
  providers: { ai: string; email: string; payments: string; errorTracking: string };
  jobs: JobStatus[];
  flagsEnabled: number;
  flagsTotal: number;
  pendingReports: number;
  emailFailuresLast24h: number;
  warnings: string[];
}

export interface WaitlistEntry {
  id: string;
  email: string;
  position: number;
  status: "waiting" | "invited" | "joined";
  createdAt: string;
}
