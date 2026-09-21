import { Types } from "mongoose";
import { childLogger } from "../config/logger";
import { hasPerk } from "../features/entitlements";
import { isFeatureEnabled } from "../features/feature.service";
import { AIProfile } from "../models/AIProfile.model";
import { Like } from "../models/Like.model";
import { Match } from "../models/Match.model";
import { Message } from "../models/Message.model";
import { User } from "../models/User.model";
import { getRecommendations } from "./ai-match.service";
import { sendTemplateEmail } from "./email/email.service";

const log = childLogger("weekly-report");

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 500;

/** ISO-8601 week key ("2026-W38"), used to make the report once-per-week. */
export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Reports go out Monday (UTC) from 08:00 — the job runs hourly and the
 * per-week dedupe key ensures each person gets exactly one. */
function inReportWindow(now: Date): boolean {
  return now.getUTCDay() === 1 && now.getUTCHours() >= 8;
}

export async function sendWeeklyReportTo(userId: string, weekKey = isoWeekKey()): Promise<"sent" | "skipped" | "failed"> {
  const user = await User.findById(userId).select("email fullName");
  if (!user) return "skipped";

  const since = new Date(Date.now() - 7 * DAY_MS);
  const me = new Types.ObjectId(userId);

  const [aiProfile, newLikes, newMatches, unreadMessages, priority] = await Promise.all([
    AIProfile.exists({ userId: me }),
    Like.countDocuments({ receiverId: me, createdAt: { $gte: since } }),
    Match.countDocuments({ $or: [{ userOne: me }, { userTwo: me }], createdAt: { $gte: since } }),
    Message.countDocuments({ receiverId: me, isRead: false }),
    hasPerk(userId, "priority_recommendations"),
  ]);

  const recommendations = aiProfile
    ? (await getRecommendations(userId, priority ? 5 : 3)).recommendations.map((rec) => ({
        name: rec.user.fullName,
        score: rec.ai.score,
        reason: rec.ai.reasons[0] ?? "Worth a conversation",
      }))
    : [];

  return sendTemplateEmail(
    { email: user.email, userId, name: user.fullName },
    "weekly-report",
    { name: user.fullName, hasAIProfile: Boolean(aiProfile), stats: { newLikes, newMatches, unreadMessages }, recommendations },
    { category: "notification", pref: "weeklyReport", dedupeKey: `weekly:${weekKey}:${userId}` },
  );
}

export async function runWeeklyReports(options: { force?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date();
  if (!options.force && !inReportWindow(now)) return { skipped: "outside_window" as const };
  if (!(await isFeatureEnabled("email_notifications"))) return { skipped: "email_disabled" as const };

  const weekKey = isoWeekKey(now);
  const users = await User.find({ emailVerified: true, status: { $ne: "suspended" } }).select("_id").limit(BATCH_LIMIT);

  const tally = { eligible: users.length, sent: 0, skipped: 0, failed: 0, week: weekKey };
  for (const user of users) {
    try {
      const outcome = await sendWeeklyReportTo(user.id, weekKey);
      tally[outcome]++;
    } catch (err) {
      tally.failed++;
      log.error({ err, userId: user.id }, "weekly report failed for a user");
    }
  }
  return tally;
}
