import { Types } from "mongoose";
import { generateDeepAnalysis } from "../ai/deep-analysis";
import { assertPerk, getEffectivePlan, hasPerk } from "../features/entitlements";
import { isFeatureEnabled } from "../features/feature.service";
import { PLANS } from "../features/plans";
import { AIProfile } from "../models/AIProfile.model";
import { DeepAnalysis, ProfileBoost } from "../models/Engagement.models";
import { Like } from "../models/Like.model";
import { Message } from "../models/Message.model";
import { User } from "../models/User.model";
import { ApiError } from "../utils/ApiError";

const HOUR_MS = 60 * 60 * 1000;
export const BOOST_DURATION_MS = HOUR_MS;

const startOfUtcDay = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const startOfUtcMonth = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

/**
 * Enforces the free plan's daily like limit. Both flags must be on for the
 * limit to exist: `like_limits` turns the paywall on, and `unlimited_likes`
 * lets paid plans through it. With `like_limits` off (the default) this does
 * nothing — the existing unlimited behaviour is untouched.
 */
export async function assertCanLike(userId: string): Promise<void> {
  if (!(await isFeatureEnabled("like_limits"))) return;
  if (await hasPerk(userId, "unlimited_likes")) return;

  const limit = PLANS.free.limits.dailyLikes;
  const used = await Like.countDocuments({ senderId: new Types.ObjectId(userId), createdAt: { $gte: startOfUtcDay() } });
  if (used >= limit) {
    const resetsAt = new Date(startOfUtcDay().getTime() + 24 * HOUR_MS);
    throw new ApiError(402, `You've used your ${limit} free likes for today. Upgrade for unlimited likes.`, {
      code: "LIKE_LIMIT_REACHED",
      limit,
      used,
      resetsAt,
      requiredPlan: "premium",
    });
  }
}

export async function getLikeAllowance(userId: string) {
  const enforced = await isFeatureEnabled("like_limits");
  const unlimited = !enforced || (await hasPerk(userId, "unlimited_likes"));
  const used = await Like.countDocuments({ senderId: new Types.ObjectId(userId), createdAt: { $gte: startOfUtcDay() } });
  return {
    enforced,
    unlimited,
    limit: unlimited ? null : PLANS.free.limits.dailyLikes,
    used,
    remaining: unlimited ? null : Math.max(0, PLANS.free.limits.dailyLikes - used),
  };
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

/** Caps how many AI recommendations a user may see when `priority_recommendations` is live. */
export async function resolveRecommendationLimit(
  userId: string,
  requested: number,
): Promise<{ limit: number; capped: boolean; cap: number | null }> {
  if (!(await isFeatureEnabled("priority_recommendations"))) return { limit: requested, capped: false, cap: null };

  const { plan } = await getEffectivePlan(userId);
  const entitled = await hasPerk(userId, "priority_recommendations");
  const cap = entitled ? PLANS[plan].limits.recommendations : PLANS.free.limits.recommendations;
  return { limit: Math.min(requested, cap), capped: requested > cap, cap };
}

// ---------------------------------------------------------------------------
// Profile boost
// ---------------------------------------------------------------------------

export async function getBoostStatus(userId: string) {
  const now = new Date();
  const userObjectId = new Types.ObjectId(userId);
  const { plan } = await getEffectivePlan(userId);
  const quota = PLANS[plan].limits.monthlyBoosts;

  const [active, usedThisMonth, enabled] = await Promise.all([
    ProfileBoost.findOne({ userId: userObjectId, endsAt: { $gt: now } }).sort({ endsAt: -1 }),
    ProfileBoost.countDocuments({ userId: userObjectId, startsAt: { $gte: startOfUtcMonth(now) } }),
    isFeatureEnabled("profile_boost"),
  ]);

  return {
    featureEnabled: enabled,
    included: quota > 0,
    active: Boolean(active),
    endsAt: active?.endsAt ?? null,
    quota,
    usedThisMonth,
    remaining: Math.max(0, quota - usedThisMonth),
    durationMinutes: BOOST_DURATION_MS / 60000,
  };
}

export async function activateBoost(userId: string) {
  await assertPerk(userId, "profile_boost");
  const status = await getBoostStatus(userId);

  if (status.active) throw ApiError.conflict("Your profile is already boosted.");
  if (status.remaining <= 0) {
    throw new ApiError(409, `You've used all ${status.quota} boosts for this month.`, { code: "BOOST_QUOTA_REACHED", quota: status.quota });
  }

  const startsAt = new Date();
  await ProfileBoost.create({ userId: new Types.ObjectId(userId), startsAt, endsAt: new Date(startsAt.getTime() + BOOST_DURATION_MS) });
  return getBoostStatus(userId);
}

/** Of `userIds`, who is boosted right now. */
export async function getBoostedUserIds(userIds: Array<Types.ObjectId | string>): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const boosts = await ProfileBoost.find({ userId: { $in: userIds }, endsAt: { $gt: new Date() } }).select("userId");
  return new Set(boosts.map((boost) => boost.userId.toString()));
}

// ---------------------------------------------------------------------------
// AI deep analysis
// ---------------------------------------------------------------------------

const REGENERATE_COOLDOWN_MS = HOUR_MS;

export async function getDeepAnalysis(userId: string) {
  await assertPerk(userId, "ai_deep_analysis");
  const [stored, aiProfile] = await Promise.all([
    DeepAnalysis.findOne({ userId: new Types.ObjectId(userId) }),
    AIProfile.findOne({ userId: new Types.ObjectId(userId) }).select("updatedAt"),
  ]);
  return {
    analysis: stored
      ? { ...(stored.data as Record<string, unknown>), source: stored.source, provider: stored.provider ?? null, generatedAt: stored.generatedAt }
      : null,
    stale: Boolean(stored && aiProfile && stored.aiProfileUpdatedAt.getTime() !== aiProfile.updatedAt.getTime()),
    hasAIProfile: Boolean(aiProfile),
  };
}

export async function createDeepAnalysis(userId: string, options: { force?: boolean } = {}) {
  await assertPerk(userId, "ai_deep_analysis");

  const aiProfile = await AIProfile.findOne({ userId: new Types.ObjectId(userId) });
  if (!aiProfile) {
    throw ApiError.conflict("Finish your AI interview first — the deep analysis builds on it.");
  }

  const existing = await DeepAnalysis.findOne({ userId: aiProfile.userId });
  const upToDate = existing && existing.aiProfileUpdatedAt.getTime() === aiProfile.updatedAt.getTime();
  const cooling = existing && Date.now() - existing.generatedAt.getTime() < REGENERATE_COOLDOWN_MS;

  // Reuse the stored analysis unless the profile changed. `force` still can't
  // dodge the cooldown — that's the guard on paid API usage. (A changed profile
  // always regenerates: it can only change by redoing the interview.)
  if (existing && upToDate && (!options.force || cooling)) return getDeepAnalysis(userId);

  const result = await generateDeepAnalysis({
    personalityType: aiProfile.personalityType,
    communicationStyle: aiProfile.communicationStyle,
    traitScores: aiProfile.traitScores,
    values: aiProfile.values,
    lifestyleTraits: aiProfile.lifestyleTraits,
    emotionalTraits: aiProfile.emotionalTraits,
    relationshipGoals: aiProfile.relationshipGoals,
    interests: aiProfile.interests,
    strengths: aiProfile.strengths,
  });

  await DeepAnalysis.findOneAndUpdate(
    { userId: aiProfile.userId },
    {
      $set: {
        data: result.data,
        source: result.source,
        provider: result.provider,
        aiProfileUpdatedAt: aiProfile.updatedAt,
        generatedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );
  return getDeepAnalysis(userId);
}

// ---------------------------------------------------------------------------
// Read receipts insights
// ---------------------------------------------------------------------------

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
};

/**
 * Analytics on the messages *you sent*: how many got read, how fast, and when.
 * A message's `updatedAt` only moves when it is marked read (messages are
 * otherwise immutable), so `updatedAt - createdAt` is its read latency.
 */
export async function getReadReceiptInsights(userId: string) {
  await assertPerk(userId, "read_receipts_insights");
  const me = new Types.ObjectId(userId);

  const sent = await Message.find({ senderId: me }).sort({ createdAt: -1 }).limit(1000).select("receiverId isRead createdAt updatedAt");
  const read = sent.filter((message) => message.isRead);
  const latencies = read.map((message) => Math.max(0, message.updatedAt.getTime() - message.createdAt.getTime()));

  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, reads: 0 }));
  for (const message of read) (byHour[message.updatedAt.getUTCHours()] as { reads: number }).reads++;

  const perPartner = new Map<string, { sent: number; read: number; latencies: number[] }>();
  for (const message of sent) {
    const key = message.receiverId.toString();
    const entry = perPartner.get(key) ?? { sent: 0, read: 0, latencies: [] };
    entry.sent++;
    if (message.isRead) {
      entry.read++;
      entry.latencies.push(Math.max(0, message.updatedAt.getTime() - message.createdAt.getTime()));
    }
    perPartner.set(key, entry);
  }

  const partners = await User.find({ _id: { $in: [...perPartner.keys()] } }).select("fullName");
  const names = new Map(partners.map((partner) => [partner.id, partner.fullName]));

  return {
    totals: {
      sent: sent.length,
      read: read.length,
      unread: sent.length - read.length,
      readRate: sent.length ? Math.round((read.length / sent.length) * 100) : null,
      medianReadSeconds: median(latencies) === null ? null : Math.round((median(latencies) as number) / 1000),
    },
    partners: [...perPartner.entries()]
      .map(([partnerId, entry]) => ({
        userId: partnerId,
        name: names.get(partnerId) ?? "Former member",
        sent: entry.sent,
        read: entry.read,
        readRate: Math.round((entry.read / entry.sent) * 100),
        medianReadSeconds: median(entry.latencies) === null ? null : Math.round((median(entry.latencies) as number) / 1000),
      }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 10),
    readsByHourUtc: byHour,
    sampleSize: sent.length,
  };
}
