import { Types } from "mongoose";
import { Match, type IMatch } from "../models/Match.model";
import { Profile } from "../models/Profile.model";
import { toPublicProfileMap } from "../utils/publicProfile";
import type { PublicProfile } from "../types/publicProfile";
import { getBlockedUserIds } from "./block.service";

export interface MatchWithProfile {
  matchId: string;
  compatibilityScore: number;
  matchedAt: Date;
  sharedInterests: string[];
  user: PublicProfile;
}

function computeSharedInterests(myInterests: Set<string>, theirInterests: string[]): string[] {
  return theirInterests.filter((interest) => myInterests.has(interest.trim().toLowerCase()));
}

export async function getMatchesForUser(userId: string): Promise<MatchWithProfile[]> {
  const currentUserObjectId = new Types.ObjectId(userId);

  const matches = await Match.find({
    $or: [{ userOne: currentUserObjectId }, { userTwo: currentUserObjectId }],
  }).sort({ createdAt: -1 });

  if (matches.length === 0) return [];

  const otherUserIds = matches.map((match) =>
    match.userOne.equals(currentUserObjectId) ? match.userTwo : match.userOne,
  );

  const [profileMap, myProfile] = await Promise.all([
    toPublicProfileMap(otherUserIds),
    Profile.findOne({ userId: currentUserObjectId }),
  ]);

  const myInterests = new Set((myProfile?.interests ?? []).map((i) => i.trim().toLowerCase()));
  const blocked = new Set(await getBlockedUserIds(userId));

  return matches
    .map((match) => {
      const otherId = match.userOne.equals(currentUserObjectId) ? match.userTwo : match.userOne;
      if (blocked.has(otherId.toString())) return null; // blocked either way: hidden
      const user = profileMap.get(otherId.toString());
      if (!user) return null;

      return {
        matchId: match.id,
        compatibilityScore: match.compatibilityScore,
        matchedAt: match.createdAt,
        sharedInterests: computeSharedInterests(myInterests, user.interests),
        user,
      };
    })
    .filter((item): item is MatchWithProfile => item !== null);
}

/** Shapes a single Match the same way the list does — reused by the
 * accept-like flow so its response can show who the match is with, not
 * just raw userOne/userTwo ids. */
export async function shapeMatchForViewer(
  match: IMatch,
  viewerId: string,
): Promise<MatchWithProfile | null> {
  const viewerObjectId = new Types.ObjectId(viewerId);
  const otherId = match.userOne.equals(viewerObjectId) ? match.userTwo : match.userOne;

  const [profileMap, myProfile] = await Promise.all([
    toPublicProfileMap([otherId]),
    Profile.findOne({ userId: viewerObjectId }),
  ]);

  const user = profileMap.get(otherId.toString());
  if (!user) return null;

  const myInterests = new Set((myProfile?.interests ?? []).map((i) => i.trim().toLowerCase()));

  return {
    matchId: match.id,
    compatibilityScore: match.compatibilityScore,
    matchedAt: match.createdAt,
    sharedInterests: computeSharedInterests(myInterests, user.interests),
    user,
  };
}
