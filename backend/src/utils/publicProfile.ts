import type { Types } from "mongoose";
import { Profile } from "../models/Profile.model";
import type { IUser } from "../models/User.model";
import type { PublicProfile } from "../types/publicProfile";

/** Batches a Profile+User lookup for a list of user ids into one query each
 * (instead of N+1 per-id lookups), keyed by user id as a string. */
export async function toPublicProfileMap(
  userIds: (Types.ObjectId | string)[],
): Promise<Map<string, PublicProfile>> {
  const map = new Map<string, PublicProfile>();
  if (userIds.length === 0) return map;

  const profiles = await Profile.find({ userId: { $in: userIds } }).populate<{
    userId: IUser;
  }>("userId", "fullName");

  for (const profile of profiles) {
    if (!profile.userId) continue;
    const id = profile.userId._id.toString();
    map.set(id, {
      id,
      fullName: profile.userId.fullName,
      age: profile.age,
      city: profile.city,
      bio: profile.bio,
      interests: profile.interests,
      relationshipGoal: profile.relationshipGoal,
      profileImage: profile.profileImage,
    });
  }

  return map;
}
