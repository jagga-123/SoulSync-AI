import { Like } from "../models/Like.model";
import { Match } from "../models/Match.model";
import { Profile } from "../models/Profile.model";
import { User } from "../models/User.model";
import { ApiError } from "../utils/ApiError";
import { calculateCompatibility } from "../utils/compatibility";
import { orderUserIds } from "../utils/objectId";
import { toPublicProfileMap } from "../utils/publicProfile";
import { events } from "../platform/events";
import { assertNotBlocked } from "./block.service";
import { assertCanLike } from "./premium.service";
import { shapeMatchForViewer } from "./match.service";

export async function sendLike(senderId: string, receiverId: string) {
  if (senderId === receiverId) {
    throw ApiError.badRequest("You can't like your own profile");
  }

  const receiver = await User.findById(receiverId);
  if (!receiver || receiver.status === "suspended") {
    throw ApiError.notFound("User not found");
  }
  await assertNotBlocked(senderId, receiverId, "You can't like this user.");
  // No-op unless the `like_limits` feature flag is on (off by default).
  await assertCanLike(senderId);

  const existing = await Like.findOne({ senderId, receiverId });
  if (existing) {
    throw ApiError.conflict("You've already liked this profile");
  }

  const [userOne, userTwo] = orderUserIds(senderId, receiverId);
  const alreadyMatched = await Match.findOne({ userOne, userTwo });
  if (alreadyMatched) {
    throw ApiError.conflict("You're already matched with this person");
  }

  const like = await Like.create({ senderId, receiverId, status: "pending" });
  events.emit("like.sent", { likeId: like.id, senderId, receiverId });
  return like.toJSON();
}

export async function getIncomingLikes(userId: string) {
  const likes = await Like.find({ receiverId: userId, status: "pending" }).sort({
    createdAt: -1,
  });
  const profileMap = await toPublicProfileMap(likes.map((like) => like.senderId));

  return likes
    .map((like) => {
      const user = profileMap.get(like.senderId.toString());
      if (!user) return null;
      return { likeId: like.id, status: like.status, createdAt: like.createdAt, user };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function getOutgoingLikes(userId: string) {
  const likes = await Like.find({ senderId: userId }).sort({ createdAt: -1 });
  const profileMap = await toPublicProfileMap(likes.map((like) => like.receiverId));

  return likes
    .map((like) => {
      const user = profileMap.get(like.receiverId.toString());
      if (!user) return null;
      return { likeId: like.id, status: like.status, createdAt: like.createdAt, user };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function acceptLike(likeId: string, userId: string) {
  const like = await Like.findById(likeId);
  if (!like) {
    throw ApiError.notFound("Like not found");
  }
  if (like.receiverId.toString() !== userId) {
    throw ApiError.forbidden("You can only accept likes sent to you");
  }
  if (like.status !== "pending") {
    throw ApiError.conflict(`This like has already been ${like.status}`);
  }

  const [senderProfile, receiverProfile] = await Promise.all([
    Profile.findOne({ userId: like.senderId }),
    Profile.findOne({ userId: like.receiverId }),
  ]);

  const compatibilityScore =
    senderProfile && receiverProfile
      ? calculateCompatibility(senderProfile, receiverProfile).score
      : 0;

  const [userOne, userTwo] = orderUserIds(like.senderId.toString(), like.receiverId.toString());
  const existingMatch = await Match.findOne({ userOne, userTwo });
  const match = existingMatch ?? (await Match.create({ userOne, userTwo, compatibilityScore }));

  like.status = "accepted";
  await like.save();

  if (!existingMatch) events.emit("match.created", { matchId: match.id, userIds: [userOne, userTwo] });

  return shapeMatchForViewer(match, userId);
}

export async function rejectLike(likeId: string, userId: string) {
  const like = await Like.findById(likeId);
  if (!like) {
    throw ApiError.notFound("Like not found");
  }
  if (like.receiverId.toString() !== userId) {
    throw ApiError.forbidden("You can only reject likes sent to you");
  }
  if (like.status === "accepted") {
    throw ApiError.conflict("This like has already become a match");
  }

  like.status = "rejected";
  await like.save();
  return like.toJSON();
}
