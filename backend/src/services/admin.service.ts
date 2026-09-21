import { Types } from "mongoose";
import { getErrorTrackerName } from "../platform/error-tracker";
import { getJobStatuses } from "../platform/jobs";
import { socketConnections } from "../platform/metrics";
import { pingDb } from "../config/db";
import { env, getEnvWarnings } from "../config/env";
import { resolveProviderName } from "../ai/providers";
import { getAllFlags } from "../features/feature.service";
import { getEffectivePlan, isSubscriptionLive } from "../features/entitlements";
import { planRank, type PlanId } from "../features/plans";
import { AIProfile } from "../models/AIProfile.model";
import { AuditLog } from "../models/AuditLog.model";
import { Block } from "../models/Block.model";
import { EmailLog } from "../models/EmailLog.model";
import { Like } from "../models/Like.model";
import { Match } from "../models/Match.model";
import { Message } from "../models/Message.model";
import { Payment } from "../models/Payment.model";
import { Profile } from "../models/Profile.model";
import { Referral } from "../models/Referral.model";
import { Report } from "../models/Report.model";
import { Subscription } from "../models/Subscription.model";
import { User } from "../models/User.model";
import { ApiError } from "../utils/ApiError";
import { getPaymentProvider } from "./billing/billing.service";
import { getEmailProvider } from "./email/providers";
import { getSubscriptionView } from "./subscription.service";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------------------------------------------------------------------
// Audit log — every admin mutation leaves a trail.
// ---------------------------------------------------------------------------

export interface AuditActor {
  id: string;
  email: string;
  ip?: string;
}

export async function writeAudit(
  actor: AuditActor,
  action: string,
  targetType: string,
  targetId: string | undefined,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await AuditLog.create({
    actorId: new Types.ObjectId(actor.id),
    actorEmail: actor.email,
    action,
    targetType,
    targetId,
    metadata,
    ip: actor.ip,
  });
}

export async function listAuditLog(page: number, limit: number) {
  const [entries, total] = await Promise.all([
    AuditLog.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AuditLog.countDocuments({}),
  ]);
  return {
    entries: entries.map((entry) => entry.toJSON()),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface ListUsersOptions {
  query?: string;
  status?: "active" | "suspended";
  role?: "user" | "admin";
  plan?: PlanId;
  page: number;
  limit: number;
}

export async function listUsers(options: ListUsersOptions) {
  const filter: Record<string, unknown> = {};
  if (options.query) {
    const pattern = new RegExp(escapeRegExp(options.query), "i");
    filter.$or = [{ fullName: pattern }, { email: pattern }];
  }
  if (options.status === "suspended") filter.status = "suspended";
  if (options.status === "active") filter.status = { $ne: "suspended" };
  if (options.role) filter.role = options.role;

  if (options.plan && options.plan !== "free") {
    const subs = await Subscription.find({ plan: options.plan, expiryDate: { $gt: new Date() }, status: { $ne: "expired" } }).select("userId");
    filter._id = { $in: subs.map((sub) => sub.userId) };
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit),
    User.countDocuments(filter),
  ]);

  const subscriptions = await Subscription.find({ userId: { $in: users.map((user) => user._id) } });
  const bestPlan = new Map<string, PlanId>();
  for (const sub of subscriptions) {
    if (!isSubscriptionLive(sub)) continue;
    const current = bestPlan.get(sub.userId.toString());
    if (!current || planRank(sub.plan) > planRank(current)) bestPlan.set(sub.userId.toString(), sub.plan);
  }

  return {
    users: users.map((user) => ({ ...user.toJSON(), plan: bestPlan.get(user.id) ?? "free" })),
    pagination: { page: options.page, limit: options.limit, total, totalPages: Math.max(1, Math.ceil(total / options.limit)) },
  };
}

export async function getUserDetail(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("User not found");
  const id = user._id;

  const [profile, aiProfile, subscription, likesSent, likesReceived, matches, messagesSent, reportsAgainst, reportsBy, blocks, referrals, payments, effective] =
    await Promise.all([
      Profile.findOne({ userId: id }),
      AIProfile.findOne({ userId: id }).select("personalityType communicationStyle confidenceScore analysisSource updatedAt"),
      getSubscriptionView(userId),
      Like.countDocuments({ senderId: id }),
      Like.countDocuments({ receiverId: id }),
      Match.countDocuments({ $or: [{ userOne: id }, { userTwo: id }] }),
      Message.countDocuments({ senderId: id }),
      Report.countDocuments({ reportedId: id }),
      Report.countDocuments({ reporterId: id }),
      Block.countDocuments({ blockedId: id }),
      Referral.countDocuments({ referrerId: id, status: "qualified" }),
      Payment.find({ userId: id }).sort({ createdAt: -1 }).limit(5),
      getEffectivePlan(userId),
    ]);

  return {
    user: { ...user.toJSON(), plan: effective.plan },
    profile: profile?.toJSON() ?? null,
    aiProfile: aiProfile?.toJSON() ?? null,
    subscription,
    activity: { likesSent, likesReceived, matches, messagesSent },
    safety: { reportsAgainst, reportsFiled: reportsBy, timesBlocked: blocks },
    referrals: { successful: referrals },
    payments: payments.map((payment) => payment.toJSON()),
  };
}

// ---------------------------------------------------------------------------
// System status
// ---------------------------------------------------------------------------

export async function getSystemInfo() {
  const [dbOk, jobs, flags, pendingReports, emailFailures] = await Promise.all([
    pingDb(),
    getJobStatuses(),
    getAllFlags(),
    Report.countDocuments({ status: { $in: ["pending", "reviewing"] } }),
    EmailLog.countDocuments({ status: "failed", createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
  ]);
  const socketGauge = await socketConnections.get();

  return {
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
    environment: env.NODE_ENV,
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    database: { connected: dbOk },
    socketConnections: socketGauge.values[0]?.value ?? 0,
    providers: {
      ai: resolveProviderName() ?? "built-in engine",
      email: getEmailProvider().name,
      payments: getPaymentProvider()?.name ?? "none",
      errorTracking: getErrorTrackerName(),
    },
    jobs,
    flagsEnabled: flags.filter((flag) => flag.enabled).length,
    flagsTotal: flags.length,
    pendingReports,
    emailFailuresLast24h: emailFailures,
    warnings: getEnvWarnings(),
  };
}

export async function listEmailLog(page: number, limit: number, status?: "sent" | "failed" | "skipped") {
  const filter = status ? { status } : {};
  const [entries, total] = await Promise.all([
    EmailLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    EmailLog.countDocuments(filter),
  ]);
  return {
    entries: entries.map((entry) => entry.toJSON()),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
