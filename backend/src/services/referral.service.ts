import { createHash, randomInt } from "node:crypto";
import { Types } from "mongoose";
import { appUrl } from "../config/env";
import { childLogger } from "../config/logger";
import { assertFeature } from "../features/entitlements";
import { isFeatureEnabled } from "../features/feature.service";
import type { PaidPlanId } from "../features/plans";
import { EmailLog } from "../models/EmailLog.model";
import { Referral, ReferralReward } from "../models/Referral.model";
import { User } from "../models/User.model";
import { events } from "../platform/events";
import { ApiError } from "../utils/ApiError";
import { sendTemplateEmail } from "./email/email.service";
import { grantPlan } from "./subscription.service";

const log = childLogger("referrals");

/**
 * The reward structure. Milestones are cumulative counts of *successful*
 * referrals (friends who finished the AI interview). Tracking always runs;
 * payouts only happen while the `referral_rewards` flag is on — and because
 * eligibility is recomputed from the counts, turning the flag on later pays
 * out everything already earned.
 */
export const REWARD_TIERS: ReadonlyArray<{ threshold: number; plan: PaidPlanId; days: number; label: string }> = [
  { threshold: 1, plan: "premium", days: 7, label: "1 week of Premium" },
  { threshold: 3, plan: "premium", days: 30, label: "1 month of Premium" },
  { threshold: 5, plan: "premium_plus", days: 30, label: "1 month of Premium Plus" },
  { threshold: 10, plan: "premium_plus", days: 90, label: "3 months of Premium Plus" },
];

// No 0/O/1/I/L: codes get read aloud and typed by hand.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateReferralCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await User.findById(userId).select("referralCode");
  if (!existing) throw ApiError.notFound("User not found");
  if (existing.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateReferralCode();
    try {
      const result = await User.updateOne({ _id: userId, referralCode: { $exists: false } }, { $set: { referralCode: code } });
      if (result.modifiedCount === 1) return code;
      // Someone (another request) set it first.
      return (await User.findById(userId).select("referralCode"))?.referralCode ?? code;
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err; // code collision — try another
    }
  }
  throw ApiError.internal("Couldn't generate a referral code");
}

/**
 * Links a brand-new user to whoever's code they signed up with. Silent on a
 * bad or stale code — a broken invite link must never block registration.
 */
export async function attributeReferral(newUserId: string, rawCode: string): Promise<{ attributed: boolean }> {
  if (!(await isFeatureEnabled("referrals"))) return { attributed: false };

  const code = rawCode.trim().toUpperCase();
  const referrer = await User.findOne({ referralCode: code }).select("_id status");
  if (!referrer || referrer.id === newUserId || referrer.status === "suspended") return { attributed: false };

  try {
    await Referral.create({ referrerId: referrer._id, referredId: new Types.ObjectId(newUserId), code });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { attributed: false };
    throw err;
  }
  await User.updateOne({ _id: newUserId }, { $set: { referredBy: referrer._id } });
  return { attributed: true };
}

/** Marks a pending referral successful (the friend finished the AI interview). */
export async function qualifyReferral(referredId: string): Promise<void> {
  const referral = await Referral.findOneAndUpdate(
    { referredId: new Types.ObjectId(referredId), status: "pending" },
    { $set: { status: "qualified", qualifiedAt: new Date() } },
    { new: true },
  );
  if (!referral) return;

  events.emit("referral.qualified", { referrerId: referral.referrerId.toString(), referredId });
  await evaluateRewards(referral.referrerId.toString());
}

/** Pays out every milestone the referrer has reached and not yet been paid. */
export async function evaluateRewards(referrerId: string): Promise<Array<{ threshold: number; label: string }>> {
  if (!(await isFeatureEnabled("referral_rewards"))) return [];

  const count = await Referral.countDocuments({ referrerId: new Types.ObjectId(referrerId), status: "qualified" });
  const granted: Array<{ threshold: number; label: string }> = [];

  for (const tier of REWARD_TIERS.filter((t) => t.threshold <= count)) {
    let claim;
    try {
      // The unique (user, threshold) index makes this the atomic "claim".
      claim = await ReferralReward.create({
        userId: new Types.ObjectId(referrerId),
        threshold: tier.threshold,
        reward: { type: "premium_days", plan: tier.plan, days: tier.days },
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) continue; // already paid
      throw err;
    }

    try {
      await grantPlan(referrerId, tier.plan, tier.days, `Referral reward: ${tier.label}`);
      granted.push({ threshold: tier.threshold, label: tier.label });
    } catch (err) {
      await claim.deleteOne(); // release the claim so a later run can retry
      log.error({ err, referrerId, tier: tier.threshold }, "referral reward grant failed");
    }
  }
  return granted;
}

export async function getReferralSummary(userId: string) {
  await assertFeature("referrals");
  const code = await getOrCreateReferralCode(userId);
  await evaluateRewards(userId); // pays out retroactively if rewards were switched on later

  const me = new Types.ObjectId(userId);
  const [referrals, rewards, rewardsEnabled] = await Promise.all([
    Referral.find({ referrerId: me }).sort({ createdAt: -1 }).limit(50),
    ReferralReward.find({ userId: me }),
    isFeatureEnabled("referral_rewards"),
  ]);

  const successful = referrals.filter((r) => r.status === "qualified").length;
  const grantedThresholds = new Set(rewards.map((r) => r.threshold));
  const users = await User.find({ _id: { $in: referrals.map((r) => r.referredId) } }).select("fullName");
  const firstNames = new Map(users.map((u) => [u.id, u.fullName.trim().split(/\s+/)[0] ?? "Friend"]));

  return {
    code,
    link: `${appUrl}/register?ref=${code}`,
    counts: { invited: referrals.length, successful, pending: referrals.length - successful },
    rewardsEnabled,
    tiers: REWARD_TIERS.map((tier) => ({
      threshold: tier.threshold,
      label: tier.label,
      achieved: successful >= tier.threshold,
      granted: grantedThresholds.has(tier.threshold),
    })),
    nextTier: REWARD_TIERS.find((tier) => tier.threshold > successful) ?? null,
    recent: referrals.slice(0, 10).map((r) => ({
      name: firstNames.get(r.referredId.toString()) ?? "Friend",
      status: r.status,
      joinedAt: r.createdAt,
    })),
  };
}

const INVITE_DAILY_CAP = 15;
const INVITE_REPEAT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function sendInvites(userId: string, emails: string[]): Promise<{ submitted: number }> {
  await assertFeature("referrals");

  const inviter = await User.findById(userId).select("fullName email");
  if (!inviter) throw ApiError.notFound("User not found");
  const code = await getOrCreateReferralCode(userId);

  const sentToday = await EmailLog.countDocuments({
    userId: new Types.ObjectId(userId),
    template: "invite",
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  });
  if (sentToday + emails.length > INVITE_DAILY_CAP) {
    throw new ApiError(429, "You've reached today's invite limit. Try again tomorrow.");
  }

  const unique = [...new Set(emails.map((email) => email.trim().toLowerCase()))].filter((email) => email !== inviter.email);

  for (const email of unique) {
    const digest = createHash("sha1").update(email).digest("hex").slice(0, 16);
    // Whether the address is already a member is deliberately not revealed to the inviter.
    if (await User.exists({ email })) continue;

    await sendTemplateEmail(
      { email, userId },
      "invite",
      { inviterName: inviter.fullName, inviteUrl: `${appUrl}/register?ref=${code}` },
      { category: "transactional", dedupeKey: `invite:${userId}:${digest}`, dedupeWindowMs: INVITE_REPEAT_WINDOW_MS },
    );
  }
  return { submitted: emails.length };
}
