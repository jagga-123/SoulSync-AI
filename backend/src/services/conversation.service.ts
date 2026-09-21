import { Types } from "mongoose";
import { Conversation, type IConversation } from "../models/Conversation.model";
import { Match } from "../models/Match.model";
import { Message } from "../models/Message.model";
import { ApiError } from "../utils/ApiError";
import { orderUserIds } from "../utils/objectId";
import { toPublicProfileMap } from "../utils/publicProfile";
import { assertNotBlocked, getBlockedUserIds } from "./block.service";

/** Verifies `userId` is a participant of the conversation — the security
 * gate every conversation-scoped operation (REST or socket) goes through
 * before touching its messages. */
export async function assertParticipant(
  conversationId: string,
  userId: string,
): Promise<IConversation> {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw ApiError.notFound("Conversation not found");
  }

  const isParticipant = conversation.participants.some((p) => p.toString() === userId);
  if (!isParticipant) {
    throw ApiError.forbidden("You don't have access to this conversation");
  }

  return conversation;
}

export async function startConversation(matchId: string, userId: string) {
  const match = await Match.findById(matchId);
  if (!match) {
    throw ApiError.notFound("Match not found");
  }

  const isUserOne = match.userOne.toString() === userId;
  const isUserTwo = match.userTwo.toString() === userId;
  if (!isUserOne && !isUserTwo) {
    throw ApiError.forbidden("This match doesn't belong to you");
  }

  const otherUserId = isUserOne ? match.userTwo.toString() : match.userOne.toString();
  await assertNotBlocked(userId, otherUserId, "You can't message this user.");
  const [a, b] = orderUserIds(userId, otherUserId);
  const participants = [new Types.ObjectId(a), new Types.ObjectId(b)];

  const conversation =
    (await Conversation.findOne({ participants })) ??
    (await Conversation.create({ participants }));

  return conversation.toJSON();
}

export async function getConversationsForUser(userId: string) {
  const userObjectId = new Types.ObjectId(userId);

  const conversations = await Conversation.find({ participants: userObjectId }).sort({
    lastMessageAt: -1,
    createdAt: -1,
  });

  if (conversations.length === 0) return [];

  const otherUserIds = conversations
    .map((conversation) => conversation.participants.find((p) => !p.equals(userObjectId)))
    .filter((id): id is Types.ObjectId => Boolean(id));

  const [profileMap, unreadCounts] = await Promise.all([
    toPublicProfileMap(otherUserIds),
    Message.aggregate<{ _id: Types.ObjectId; count: number }>([
      {
        $match: {
          conversationId: { $in: conversations.map((c) => c._id) },
          receiverId: userObjectId,
          isRead: false,
        },
      },
      { $group: { _id: "$conversationId", count: { $sum: 1 } } },
    ]),
  ]);

  const unreadMap = new Map(unreadCounts.map((u) => [u._id.toString(), u.count]));

  const blocked = new Set(await getBlockedUserIds(userId));

  return conversations
    .map((conversation) => {
      const otherId = conversation.participants.find((p) => !p.equals(userObjectId));
      if (otherId && blocked.has(otherId.toString())) return null; // blocked either way: hidden
      const user = otherId && profileMap.get(otherId.toString());
      if (!user) return null;

      return {
        conversationId: conversation.id,
        user,
        lastMessage: conversation.lastMessage ?? null,
        lastMessageAt: conversation.lastMessageAt ?? conversation.createdAt,
        unreadCount: unreadMap.get(conversation.id) ?? 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function getMessages(
  conversationId: string,
  userId: string,
  page: number,
  limit: number,
) {
  await assertParticipant(conversationId, userId);

  const skip = (page - 1) * limit;

  const [latestFirst, total] = await Promise.all([
    Message.find({ conversationId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Message.countDocuments({ conversationId }),
  ]);

  // Fetched latest-first (cheap to paginate "load earlier" backwards from
  // the newest message); reversed here so the chat renders chronologically.
  const messages = latestFirst
    .slice()
    .reverse()
    .map((message) => message.toJSON());

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    messages,
    pagination: { page, limit, total, totalPages, hasMore: page < totalPages },
  };
}
