import { Types } from "mongoose";
import { assertFeature } from "../features/entitlements";
import { Block } from "../models/Block.model";
import { User } from "../models/User.model";
import { ApiError } from "../utils/ApiError";
import { toPublicProfileMap } from "../utils/publicProfile";
import type { PublicProfile } from "../types/publicProfile";

/**
 * Everyone `userId` must not interact with: people they blocked AND people who
 * blocked them. Blocking is symmetric in effect — neither side sees the other
 * in Discover, recommendations or the like/message flows.
 */
export async function getBlockedUserIds(userId: string): Promise<string[]> {
  const me = new Types.ObjectId(userId);
  const blocks = await Block.find({ $or: [{ blockerId: me }, { blockedId: me }] }).select("blockerId blockedId");
  const ids = new Set<string>();
  for (const block of blocks) {
    ids.add(block.blockerId.equals(me) ? block.blockedId.toString() : block.blockerId.toString());
  }
  return [...ids];
}

export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const exists = await Block.exists({
    $or: [
      { blockerId: new Types.ObjectId(a), blockedId: new Types.ObjectId(b) },
      { blockerId: new Types.ObjectId(b), blockedId: new Types.ObjectId(a) },
    ],
  });
  return Boolean(exists);
}

/** Throws 403 if either user has blocked the other. The message is deliberately
 * neutral — it must not reveal *who* blocked whom. */
export async function assertNotBlocked(a: string, b: string, message = "You can't interact with this user."): Promise<void> {
  if (await isBlockedBetween(a, b)) {
    throw new ApiError(403, message, { code: "BLOCKED" });
  }
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await assertFeature("blocking");
  if (blockerId === blockedId) throw ApiError.badRequest("You can't block yourself.");

  const target = await User.exists({ _id: blockedId });
  if (!target) throw ApiError.notFound("User not found");

  await Block.updateOne(
    { blockerId: new Types.ObjectId(blockerId), blockedId: new Types.ObjectId(blockedId) },
    { $setOnInsert: { blockerId: new Types.ObjectId(blockerId), blockedId: new Types.ObjectId(blockedId) } },
    { upsert: true },
  );
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await Block.deleteOne({ blockerId: new Types.ObjectId(blockerId), blockedId: new Types.ObjectId(blockedId) });
}

export async function listBlockedUsers(blockerId: string): Promise<Array<{ user: PublicProfile; blockedAt: Date }>> {
  const blocks = await Block.find({ blockerId: new Types.ObjectId(blockerId) }).sort({ createdAt: -1 });
  const profiles = await toPublicProfileMap(blocks.map((block) => block.blockedId));
  return blocks
    .map((block) => {
      const user = profiles.get(block.blockedId.toString());
      return user ? { user, blockedAt: block.createdAt } : null;
    })
    .filter((entry): entry is { user: PublicProfile; blockedAt: Date } => entry !== null);
}
