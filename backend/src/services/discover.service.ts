import { Types, type FilterQuery } from "mongoose";
import { Profile, type IProfile } from "../models/Profile.model";
import { Like } from "../models/Like.model";
import { Match } from "../models/Match.model";
import { User, type IUser } from "../models/User.model";
import type { PublicProfile } from "../types/publicProfile";
import { getBlockedUserIds } from "./block.service";

export interface DiscoverFilters {
  page: number;
  limit: number;
  city?: string;
  relationshipGoal?: string;
  // Advanced filters (Premium — gated in the controller).
  ageMin?: number;
  ageMax?: number;
  gender?: string;
  interests?: string[];
}

export interface DiscoverResult {
  users: PublicProfile[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function discoverUsers(
  currentUserId: string,
  filters: DiscoverFilters,
): Promise<DiscoverResult> {
  const currentUserObjectId = new Types.ObjectId(currentUserId);

  const [matches, sentLikes, blockedIds, suspended] = await Promise.all([
    Match.find({
      $or: [{ userOne: currentUserObjectId }, { userTwo: currentUserObjectId }],
    }).select("userOne userTwo"),
    Like.find({ senderId: currentUserObjectId }).select("receiverId"),
    getBlockedUserIds(currentUserId),
    User.find({ status: "suspended" }).select("_id"),
  ]);

  // Discover excludes: myself, anyone I've already matched with, and anyone
  // I've already sent a like to (any status) — re-showing someone I've
  // already acted on isn't useful in a discovery feed. Since Phase 6 it also
  // hides blocked users (in either direction) and suspended accounts.
  const excludedIds = new Set<string>([currentUserId, ...blockedIds, ...suspended.map((u) => u.id)]);
  for (const match of matches) {
    excludedIds.add(
      match.userOne.equals(currentUserObjectId)
        ? match.userTwo.toString()
        : match.userOne.toString(),
    );
  }
  for (const like of sentLikes) {
    excludedIds.add(like.receiverId.toString());
  }

  const query: FilterQuery<IProfile> = {
    userId: { $nin: [...excludedIds].map((id) => new Types.ObjectId(id)) },
  };

  if (filters.city) {
    query.city = new RegExp(escapeRegExp(filters.city), "i");
  }
  if (filters.relationshipGoal) {
    query.relationshipGoal = filters.relationshipGoal;
  }
  if (filters.ageMin !== undefined || filters.ageMax !== undefined) {
    query.age = {
      ...(filters.ageMin !== undefined ? { $gte: filters.ageMin } : {}),
      ...(filters.ageMax !== undefined ? { $lte: filters.ageMax } : {}),
    };
  }
  if (filters.gender) {
    query.gender = filters.gender;
  }
  if (filters.interests && filters.interests.length > 0) {
    query.interests = {
      $in: filters.interests.map((interest) => new RegExp(`^${escapeRegExp(interest)}$`, "i")),
    };
  }

  const skip = (filters.page - 1) * filters.limit;

  const [profiles, total] = await Promise.all([
    Profile.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(filters.limit)
      .populate<{ userId: IUser }>("userId", "fullName"),
    Profile.countDocuments(query),
  ]);

  const users: PublicProfile[] = profiles
    .filter((profile) => profile.userId)
    .map((profile) => ({
      id: profile.userId._id.toString(),
      fullName: profile.userId.fullName,
      age: profile.age,
      city: profile.city,
      bio: profile.bio,
      interests: profile.interests,
      relationshipGoal: profile.relationshipGoal,
      profileImage: profile.profileImage,
    }));

  const totalPages = Math.max(1, Math.ceil(total / filters.limit));

  return {
    users,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages,
      hasMore: filters.page < totalPages,
    },
  };
}
