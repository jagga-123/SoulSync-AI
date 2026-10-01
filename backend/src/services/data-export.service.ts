import { Types } from "mongoose";
import { AIProfile } from "../models/AIProfile.model";
import { Conversation } from "../models/Conversation.model";
import { Match } from "../models/Match.model";
import { Message } from "../models/Message.model";
import { Profile } from "../models/Profile.model";
import { User } from "../models/User.model";
import { toPublicProfileMap } from "../utils/publicProfile";
import { getSettings } from "./account.service";

/** Keeps a single conversation's export bounded for a very long-lived chat — the most
 * recent messages are kept (in chronological order), rather than loading an unbounded
 * history into memory. */
const MESSAGES_PER_CONVERSATION_CAP = 1000;

/**
 * Everything this member owns, as plain JSON — self-service GDPR/CCPA-style export.
 * Deliberately excludes payment records (kept separately by opaque id for accounting,
 * same rationale as account deletion) and anything belonging to another member beyond
 * their already-public profile shape (never their private data).
 */
export async function exportUserData(userId: string) {
  const uid = new Types.ObjectId(userId);

  const [user, profile, aiProfile, settings, matches, conversations] = await Promise.all([
    User.findById(uid),
    Profile.findOne({ userId: uid }),
    AIProfile.findOne({ userId: uid }),
    getSettings(userId),
    Match.find({ $or: [{ userOne: uid }, { userTwo: uid }] }).sort({ createdAt: -1 }),
    Conversation.find({ participants: uid }).sort({ lastMessageAt: -1 }),
  ]);

  const otherPartyIds = matches.map((m) => (m.userOne.equals(uid) ? m.userTwo : m.userOne));
  const otherPartyProfiles = await toPublicProfileMap(otherPartyIds);

  const messagesByConversation = await Promise.all(
    conversations.map(async (conversation) => {
      const found = await Message.find({ conversationId: conversation._id })
        .sort({ createdAt: -1 })
        .limit(MESSAGES_PER_CONVERSATION_CAP);
      return {
        conversationId: conversation.id,
        otherParticipantIds: conversation.participants.filter((p) => !p.equals(uid)).map((p) => p.toString()),
        lastMessage: conversation.lastMessage,
        lastMessageAt: conversation.lastMessageAt,
        messageCountExported: found.length,
        truncated: found.length >= MESSAGES_PER_CONVERSATION_CAP,
        // Chronological order for reading, even though the query fetched newest-first to cap correctly.
        messages: found.reverse().map((m) => ({
          id: m.id,
          direction: m.senderId.equals(uid) ? "sent" : "received",
          content: m.isHidden ? "[Message removed by moderators]" : m.content,
          type: m.type,
          isRead: m.isRead,
          createdAt: m.createdAt,
        })),
      };
    }),
  );

  return {
    exportedAt: new Date().toISOString(),
    account: user
      ? {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          emailVerified: user.emailVerified,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt,
        }
      : null,
    profile: profile?.toJSON() ?? null,
    personalityReport: aiProfile?.toJSON() ?? null,
    settings,
    matches: matches.map((m) => ({
      matchId: m.id,
      otherMember: otherPartyProfiles.get((m.userOne.equals(uid) ? m.userTwo : m.userOne).toString()) ?? null,
      compatibilityScore: m.compatibilityScore,
      matchedAt: m.createdAt,
    })),
    conversations: messagesByConversation,
  };
}
