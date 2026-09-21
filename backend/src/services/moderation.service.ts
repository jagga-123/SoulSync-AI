import { Types } from "mongoose";
import { childLogger } from "../config/logger";
import { AIProfile } from "../models/AIProfile.model";
import { Block } from "../models/Block.model";
import { Conversation } from "../models/Conversation.model";
import { DeepAnalysis, ProfileBoost, ProfileView } from "../models/Engagement.models";
import { EmailLog } from "../models/EmailLog.model";
import { InterviewSession } from "../models/InterviewSession.model";
import { Like } from "../models/Like.model";
import { Match } from "../models/Match.model";
import { MatchInsight } from "../models/MatchInsight.model";
import { Message } from "../models/Message.model";
import { Notification } from "../models/Notification.model";
import { Profile } from "../models/Profile.model";
import { Referral, ReferralReward } from "../models/Referral.model";
import { Subscription } from "../models/Subscription.model";
import { User } from "../models/User.model";
import { UserSettings } from "../models/UserSettings.model";
import { events } from "../platform/events";
import { disconnectUser } from "../socket";
import { ApiError } from "../utils/ApiError";

const log = childLogger("moderation");

async function loadModeratableUser(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("User not found");
  // Admins can't be suspended or deleted through moderation — that would let
  // one compromised or rogue moderator lock everyone else out.
  if (user.role === "admin") throw ApiError.forbidden("Admin accounts can't be moderated. Demote the account first.");
  return user;
}

export async function suspendUser(userId: string, reason: string): Promise<void> {
  const user = await loadModeratableUser(userId);
  user.status = "suspended";
  user.suspendedAt = new Date();
  user.suspendedReason = reason.slice(0, 300);
  await user.save();

  disconnectUser(userId);
  events.emit("user.suspended", { userId, reason });
  log.info({ userId, reason }, "user suspended");
}

export async function unsuspendUser(userId: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("User not found");
  user.status = "active";
  user.suspendedAt = undefined;
  user.suspendedReason = undefined;
  await user.save();
}

/**
 * Permanently deletes an account and everything tied to it: profile, AI
 * profile and interview, likes, matches, conversations and messages,
 * notifications, referrals, and so on. Payment records are the one deliberate
 * exception — they're kept (by opaque user id) for accounting and tax
 * retention obligations.
 */
export async function deleteUserCascade(userId: string): Promise<{ deletedMessages: number }> {
  const user = await loadModeratableUser(userId);
  const id = new Types.ObjectId(userId);

  const conversations = await Conversation.find({ participants: id }).select("_id");
  const conversationIds = conversations.map((c) => c._id);
  const messages = await Message.deleteMany({ conversationId: { $in: conversationIds } });

  await Promise.all([
    Conversation.deleteMany({ _id: { $in: conversationIds } }),
    Profile.deleteOne({ userId: id }),
    AIProfile.deleteOne({ userId: id }),
    InterviewSession.deleteOne({ userId: id }),
    DeepAnalysis.deleteOne({ userId: id }),
    ProfileBoost.deleteMany({ userId: id }),
    ProfileView.deleteMany({ $or: [{ viewerId: id }, { targetId: id }] }),
    Like.deleteMany({ $or: [{ senderId: id }, { receiverId: id }] }),
    Match.deleteMany({ $or: [{ userOne: id }, { userTwo: id }] }),
    MatchInsight.deleteMany({ $or: [{ userOne: id }, { userTwo: id }] }),
    Notification.deleteMany({ userId: id }),
    UserSettings.deleteOne({ userId: id }),
    Subscription.deleteMany({ userId: id }),
    Block.deleteMany({ $or: [{ blockerId: id }, { blockedId: id }] }),
    Referral.deleteMany({ $or: [{ referrerId: id }, { referredId: id }] }),
    ReferralReward.deleteMany({ userId: id }),
    EmailLog.deleteMany({ userId: id }),
  ]);

  disconnectUser(userId);
  await user.deleteOne();
  log.info({ userId }, "user deleted");
  return { deletedMessages: messages.deletedCount };
}
