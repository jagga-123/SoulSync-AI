import type { Model } from "mongoose";
import { AIProfile } from "../models/AIProfile.model";
import { InterviewSession } from "../models/InterviewSession.model";
import { Like } from "../models/Like.model";
import { Match } from "../models/Match.model";
import { Message } from "../models/Message.model";
import { Payment } from "../models/Payment.model";
import { Profile } from "../models/Profile.model";
import { Report } from "../models/Report.model";
import { Subscription } from "../models/Subscription.model";
import { User } from "../models/User.model";
import { PLANS } from "../features/plans";

const DAY_MS = 24 * 60 * 60 * 1000;

// Dashboards refresh often and these are full-collection aggregations, so
// results are cached briefly. Fine for an admin surface; tests can bypass it.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await compute();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function clearAnalyticsCache(): void {
  cache.clear();
}

const startOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const percent = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

async function countDistinct(model: Model<never>, field: string): Promise<number> {
  const result = await (model as unknown as Model<Record<string, unknown>>).aggregate<{ n: number }>([
    { $group: { _id: `$${field}` } },
    { $count: "n" },
  ]);
  return result[0]?.n ?? 0;
}

async function countMatchedUsers(): Promise<number> {
  const result = await Match.aggregate<{ n: number }>([
    { $project: { users: ["$userOne", "$userTwo"] } },
    { $unwind: "$users" },
    { $group: { _id: "$users" } },
    { $count: "n" },
  ]);
  return result[0]?.n ?? 0;
}

/** Live paid subscribers by plan, as of now. */
async function livePaidByPlan(): Promise<Record<"premium" | "premium_plus", number>> {
  const rows = await Subscription.aggregate<{ _id: string; n: number }>([
    { $match: { source: "paid", expiryDate: { $gt: new Date() }, status: { $ne: "expired" } } },
    { $group: { _id: "$plan", n: { $sum: 1 } } },
  ]);
  const map = new Map(rows.map((row) => [row._id, row.n]));
  return { premium: map.get("premium") ?? 0, premium_plus: map.get("premium_plus") ?? 0 };
}

// ---------------------------------------------------------------------------
// Overview KPIs
// ---------------------------------------------------------------------------

export function getOverview() {
  return cached("overview", async () => {
    const now = Date.now();
    const ago = (days: number) => new Date(now - days * DAY_MS);

    const [
      totalUsers, active24h, active7d, active30d, new7d, new30d, suspended, verified,
      totalMatches, matches7d, totalMessages, messages7d, totalLikes, acceptedLikes,
      aiProfiles, pendingReports, paid, newPaid30d,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ lastActiveAt: { $gte: ago(1) } }),
      User.countDocuments({ lastActiveAt: { $gte: ago(7) } }),
      User.countDocuments({ lastActiveAt: { $gte: ago(30) } }),
      User.countDocuments({ createdAt: { $gte: ago(7) } }),
      User.countDocuments({ createdAt: { $gte: ago(30) } }),
      User.countDocuments({ status: "suspended" }),
      User.countDocuments({ emailVerified: true }),
      Match.countDocuments({}),
      Match.countDocuments({ createdAt: { $gte: ago(7) } }),
      Message.countDocuments({}),
      Message.countDocuments({ createdAt: { $gte: ago(7) } }),
      Like.countDocuments({}),
      Like.countDocuments({ status: "accepted" }),
      AIProfile.countDocuments({}),
      Report.countDocuments({ status: { $in: ["pending", "reviewing"] } }),
      livePaidByPlan(),
      Subscription.countDocuments({ source: "paid", startDate: { $gte: ago(30) } }),
    ]);

    // Monthly-recurring-revenue estimate in USD: yearly plans count at 1/12.
    const paidSubs = await Subscription.find({ source: "paid", expiryDate: { $gt: new Date() }, status: { $ne: "expired" } }).select("plan billingInterval");
    const mrrCents = paidSubs.reduce((sum, sub) => {
      if (sub.plan === "free") return sum;
      const prices = PLANS[sub.plan].prices.usd;
      return sum + (sub.billingInterval === "yearly" ? prices.yearly / 12 : prices.monthly);
    }, 0);

    return {
      users: { total: totalUsers, active24h, active7d, active30d, new7d, new30d, suspended, emailVerified: verified },
      matches: { total: totalMatches, last7d: matches7d },
      messages: { total: totalMessages, last7d: messages7d },
      likes: { total: totalLikes, accepted: acceptedLikes },
      interviews: { completed: aiProfiles },
      premium: {
        subscribers: paid.premium + paid.premium_plus,
        byPlan: paid,
        newLast30d: newPaid30d,
        mrrUsd: Math.round(mrrCents) / 100,
      },
      moderation: { pendingReports },
      generatedAt: new Date().toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------
// Time series
// ---------------------------------------------------------------------------

export const TIMESERIES_METRICS = ["registrations", "matches", "messages", "likes", "interviews", "premium"] as const;
export type TimeseriesMetric = (typeof TIMESERIES_METRICS)[number];

const SOURCES: Record<TimeseriesMetric, { model: Model<never>; field: string; match?: Record<string, unknown> }> = {
  registrations: { model: User as unknown as Model<never>, field: "createdAt" },
  matches: { model: Match as unknown as Model<never>, field: "createdAt" },
  messages: { model: Message as unknown as Model<never>, field: "createdAt" },
  likes: { model: Like as unknown as Model<never>, field: "createdAt" },
  interviews: { model: AIProfile as unknown as Model<never>, field: "createdAt" },
  premium: { model: Subscription as unknown as Model<never>, field: "startDate", match: { source: "paid" } },
};

export function getTimeseries(metric: TimeseriesMetric, days: number) {
  return cached(`ts:${metric}:${days}`, async () => {
    const source = SOURCES[metric];
    const since = startOfUtcDay(new Date(Date.now() - (days - 1) * DAY_MS));

    const rows = await (source.model as unknown as Model<Record<string, unknown>>).aggregate<{ _id: string; count: number }>([
      { $match: { [source.field]: { $gte: since }, ...(source.match ?? {}) } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: `$${source.field}`, timezone: "UTC" } }, count: { $sum: 1 } } },
    ]);
    const byDay = new Map(rows.map((row) => [row._id, row.count]));

    // Zero-fill so a quiet day is a 0 on the chart, not a gap.
    const points = Array.from({ length: days }, (_, index) => {
      const date = new Date(since.getTime() + index * DAY_MS).toISOString().slice(0, 10);
      return { date, value: byDay.get(date) ?? 0 };
    });
    return { metric, days, total: points.reduce((sum, point) => sum + point.value, 0), points };
  });
}

// ---------------------------------------------------------------------------
// Rates & funnel
// ---------------------------------------------------------------------------

export function getRates() {
  return cached("rates", async () => {
    const [users, withProfile, started, completed, matchedUsers, totalLikes, acceptedLikes, matches, activeConversations, messages7d, active7d, paid] =
      await Promise.all([
        User.countDocuments({}),
        Profile.countDocuments({}),
        InterviewSession.countDocuments({}),
        AIProfile.countDocuments({}),
        countMatchedUsers(),
        Like.countDocuments({}),
        Like.countDocuments({ status: "accepted" }),
        Match.countDocuments({}),
        // Conversations with at least one message.
        Message.aggregate<{ n: number }>([{ $group: { _id: "$conversationId" } }, { $count: "n" }]).then((r) => r[0]?.n ?? 0),
        Message.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * DAY_MS) } }),
        User.countDocuments({ lastActiveAt: { $gte: new Date(Date.now() - 7 * DAY_MS) } }),
        livePaidByPlan(),
      ]);

    const paidTotal = paid.premium + paid.premium_plus;
    return {
      interviewStartRate: percent(started, withProfile),
      interviewCompletionRate: percent(completed, withProfile),
      interviewFinishRate: percent(completed, started),
      matchRate: percent(matchedUsers, withProfile),
      likeToMatchRate: percent(acceptedLikes, totalLikes),
      conversationRate: percent(activeConversations, matches),
      messagesPerActiveUser7d: active7d > 0 ? Math.round((messages7d / active7d) * 10) / 10 : null,
      premiumConversion: percent(paidTotal, users),
      counts: { users, withProfile, started, completed, matchedUsers, totalLikes, acceptedLikes, matches, activeConversations, paidTotal },
    };
  });
}

export function getFunnel() {
  return cached("funnel", async () => {
    const [registered, profiles, started, completed, likers, matched, messagers, paid] = await Promise.all([
      User.countDocuments({}),
      Profile.countDocuments({}),
      InterviewSession.countDocuments({}),
      AIProfile.countDocuments({}),
      countDistinct(Like as unknown as Model<never>, "senderId"),
      countMatchedUsers(),
      countDistinct(Message as unknown as Model<never>, "senderId"),
      livePaidByPlan(),
    ]);

    const steps = [
      { key: "registered", label: "Registered", count: registered },
      { key: "profile", label: "Created a profile", count: profiles },
      { key: "interview_started", label: "Started the AI interview", count: started },
      { key: "interview_completed", label: "Completed the AI interview", count: completed },
      { key: "first_like", label: "Sent a like", count: likers },
      { key: "first_match", label: "Got a match", count: matched },
      { key: "first_message", label: "Sent a message", count: messagers },
      { key: "premium", label: "Subscribed to Premium", count: paid.premium + paid.premium_plus },
    ];

    return {
      steps: steps.map((step, index) => ({
        ...step,
        fromPrevious: index === 0 ? null : percent(step.count, (steps[index - 1] as { count: number }).count),
        fromStart: percent(step.count, registered),
      })),
    };
  });
}

/** Revenue actually collected, per currency (never summed across currencies). */
export function getRevenue(days: number) {
  return cached(`revenue:${days}`, async () => {
    const since = new Date(Date.now() - days * DAY_MS);
    const rows = await Payment.aggregate<{ _id: string; total: number; count: number }>([
      { $match: { status: "succeeded", paidAt: { $gte: since } } },
      { $group: { _id: "$currency", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    return { days, byCurrency: rows.map((row) => ({ currency: row._id, amountMinor: row.total, payments: row.count })) };
  });
}
