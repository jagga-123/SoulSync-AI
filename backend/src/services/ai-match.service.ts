import { Types } from "mongoose";
import { AIProfile, type IAIProfile } from "../models/AIProfile.model";
import { Like } from "../models/Like.model";
import { Match } from "../models/Match.model";
import { MatchInsight } from "../models/MatchInsight.model";
import { Profile } from "../models/Profile.model";
import {
  buildCompatibilityProfile,
  buildTemplateExplanation,
  calculateAICompatibility,
  type AICompatibility,
  type CompatibilityDimension,
  type CompatibilityReason,
  type CompatibilityTier,
  type DimensionScore,
} from "../ai/compatibility";
import { generateExplanation } from "../ai/explanation";
import { resolveProviderName } from "../ai/providers";
import type { CompatibilityProfile } from "../ai/types";
import { ApiError } from "../utils/ApiError";
import { orderUserIds } from "../utils/objectId";
import { toPublicProfileMap } from "../utils/publicProfile";
import type { PublicProfile } from "../types/publicProfile";
import { getBlockedUserIds } from "./block.service";
import { getBoostedUserIds } from "./premium.service";

/** A candidate pool larger than this is trimmed to the most recently updated
 * AI profiles before scoring, so a recommendations request stays bounded. */
const RECOMMENDATION_POOL_SIZE = 200;
const TOP_REASONS = 3;
// A boosted profile jumps ahead of everyone — but only if it's at least a
// reasonable match, so buying a boost can't push genuinely poor matches to the top.
const BOOST_RANK_BONUS = 100;
const BOOST_MIN_SCORE = 40;
// A template explanation stored because no provider answered is retried
// (at most) this often once a provider is available.
const TEMPLATE_RETRY_MS = 10 * 60 * 1000;

export interface AIMatchSummary {
  score: number;
  tier: CompatibilityTier;
  reasons: string[];
}

export interface AICompatibilityDetail extends AIMatchSummary {
  breakdown: Record<CompatibilityDimension, DimensionScore>;
  reasonDetails: CompatibilityReason[];
  explanation: string;
  explanationSource: "llm" | "template";
  shared: AICompatibility["shared"];
}

export type CompatibilityLookup =
  | { available: true; compatibility: AICompatibilityDetail }
  | { available: false; reason: "viewer_not_ready" | "other_not_ready" };

export interface AIRecommendation {
  user: PublicProfile;
  ai: AIMatchSummary & { explanation: string };
}

function summarize(result: AICompatibility): AIMatchSummary {
  return {
    score: result.score,
    tier: result.tier,
    reasons: result.reasons.slice(0, TOP_REASONS).map((reason) => reason.text),
  };
}

interface Participant {
  ai: IAIProfile;
  basic: { interests: string[]; relationshipGoal: string } | null;
}

function toCompatibilityProfile({ ai, basic }: Participant): CompatibilityProfile {
  return buildCompatibilityProfile(ai, basic);
}

/** Everyone the viewer shouldn't be recommended: themselves, current matches,
 * and anyone they've already liked — the same exclusions Discover applies. */
async function getExcludedUserIds(viewerId: string): Promise<Types.ObjectId[]> {
  const viewer = new Types.ObjectId(viewerId);
  const [matches, sentLikes, blocked] = await Promise.all([
    Match.find({ $or: [{ userOne: viewer }, { userTwo: viewer }] }).select("userOne userTwo"),
    Like.find({ senderId: viewer }).select("receiverId"),
    getBlockedUserIds(viewerId),
  ]);

  const excluded = new Set<string>([viewerId, ...blocked]);
  for (const match of matches) {
    excluded.add(match.userOne.equals(viewer) ? match.userTwo.toString() : match.userOne.toString());
  }
  for (const like of sentLikes) excluded.add(like.receiverId.toString());

  return [...excluded].map((id) => new Types.ObjectId(id));
}

async function loadViewer(viewerId: string): Promise<Participant | null> {
  const viewer = new Types.ObjectId(viewerId);
  const [ai, profile] = await Promise.all([
    AIProfile.findOne({ userId: viewer }),
    Profile.findOne({ userId: viewer }),
  ]);
  if (!ai) return null;
  return {
    ai,
    basic: profile ? { interests: profile.interests, relationshipGoal: profile.relationshipGoal } : null,
  };
}

// ---------------------------------------------------------------------------
// Discover
// ---------------------------------------------------------------------------

/** Adds an `ai` score + top reasons to each Discover candidate. Pure scoring,
 * no model calls — one batched AIProfile lookup for the whole page. */
export async function attachAIScores<T extends PublicProfile>(
  viewerId: string,
  users: T[],
): Promise<{ viewerReady: boolean; users: Array<T & { ai: AIMatchSummary | null }> }> {
  const viewer = await loadViewer(viewerId);
  if (!viewer) {
    return { viewerReady: false, users: users.map((user) => ({ ...user, ai: null })) };
  }

  const candidates = await AIProfile.find({
    userId: { $in: users.map((user) => new Types.ObjectId(user.id)) },
  });
  const byUser = new Map(candidates.map((candidate) => [candidate.userId.toString(), candidate]));
  const viewerProfile = toCompatibilityProfile(viewer);

  return {
    viewerReady: true,
    users: users.map((user) => {
      const candidate = byUser.get(user.id);
      if (!candidate) return { ...user, ai: null };

      const result = calculateAICompatibility(
        viewerProfile,
        toCompatibilityProfile({
          ai: candidate,
          basic: { interests: user.interests, relationshipGoal: user.relationshipGoal },
        }),
      );
      return { ...user, ai: result ? summarize(result) : null };
    }),
  };
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

export async function getRecommendations(
  viewerId: string,
  limit: number,
): Promise<{ viewerReady: boolean; recommendations: AIRecommendation[] }> {
  const viewer = await loadViewer(viewerId);
  if (!viewer) return { viewerReady: false, recommendations: [] };

  const excluded = await getExcludedUserIds(viewerId);
  const pool = await AIProfile.find({ userId: { $nin: excluded } })
    .sort({ updatedAt: -1 })
    .limit(RECOMMENDATION_POOL_SIZE);
  if (pool.length === 0) return { viewerReady: true, recommendations: [] };

  const publicProfiles = await toPublicProfileMap(pool.map((candidate) => candidate.userId));
  const viewerProfile = toCompatibilityProfile(viewer);

  const scored: Array<{ user: PublicProfile; result: AICompatibility }> = [];
  for (const candidate of pool) {
    const user = publicProfiles.get(candidate.userId.toString());
    if (!user) continue;

    const result = calculateAICompatibility(
      viewerProfile,
      toCompatibilityProfile({
        ai: candidate,
        basic: { interests: user.interests, relationshipGoal: user.relationshipGoal },
      }),
    );
    if (result) scored.push({ user, result });
  }

  // Boosted profiles (a Premium Plus perk) sort ahead of the pack. This only
  // affects ordering — the score shown to everyone is the honest one.
  const boosted = await getBoostedUserIds(scored.map(({ user }) => user.id));
  const rank = ({ user, result }: { user: PublicProfile; result: AICompatibility }) =>
    result.score + (boosted.has(user.id) && result.score >= BOOST_MIN_SCORE ? BOOST_RANK_BONUS : 0);
  scored.sort((a, b) => rank(b) - rank(a));

  return {
    viewerReady: true,
    recommendations: scored.slice(0, limit).map(({ user, result }) => ({
      user,
      ai: { ...summarize(result), explanation: buildTemplateExplanation(result) },
    })),
  };
}

/**
 * For "a great match just joined" notifications: the people whose compatibility
 * with `userId` is at least `threshold`, best first. Same exclusions as
 * recommendations (matched, liked, blocked), and only people with an AI profile.
 */
export async function findHighCompatibilityCandidates(
  userId: string,
  threshold: number,
  limit: number,
): Promise<Array<{ userId: string; name: string; score: number }>> {
  const { recommendations } = await getRecommendations(userId, Math.max(limit * 3, 30));
  return recommendations
    .filter((rec) => rec.ai.score >= threshold)
    .slice(0, limit)
    .map((rec) => ({ userId: rec.user.id, name: rec.user.fullName, score: rec.ai.score }));
}

// ---------------------------------------------------------------------------
// Pairwise compatibility (+ stored explanations for matches)
// ---------------------------------------------------------------------------

interface StoredExplanation {
  text: string;
  source: "llm" | "template";
}

/** For matched pairs, the explanation is written once (by the AI provider
 * when one is configured) and stored; it's regenerated only if either
 * person's AI profile has changed since. */
async function getStoredExplanation(
  viewerId: string,
  otherId: string,
  viewerAI: IAIProfile,
  otherAI: IAIProfile,
  result: AICompatibility,
): Promise<StoredExplanation> {
  const [oneId, twoId] = orderUserIds(viewerId, otherId);
  const oneIsViewer = oneId === viewerId;
  const inputsUpdatedAt = {
    userOne: (oneIsViewer ? viewerAI : otherAI).updatedAt,
    userTwo: (oneIsViewer ? otherAI : viewerAI).updatedAt,
  };
  const pair = { userOne: new Types.ObjectId(oneId), userTwo: new Types.ObjectId(twoId) };

  const existing = await MatchInsight.findOne(pair);
  if (existing) {
    const fresh =
      existing.inputsUpdatedAt.userOne.getTime() === inputsUpdatedAt.userOne.getTime() &&
      existing.inputsUpdatedAt.userTwo.getTime() === inputsUpdatedAt.userTwo.getTime();
    const retryable =
      existing.explanationSource === "template" &&
      resolveProviderName() !== null &&
      Date.now() - existing.updatedAt.getTime() > TEMPLATE_RETRY_MS;

    if (fresh && !retryable) {
      return { text: existing.explanation, source: existing.explanationSource };
    }
  }

  const explanation = await generateExplanation(result);
  const document = {
    score: result.score,
    tier: result.tier,
    breakdown: result.breakdown,
    reasons: result.reasons,
    explanation: explanation.text,
    explanationSource: explanation.source,
    provider: explanation.provider,
    providerModel: explanation.model,
    inputsUpdatedAt,
  };

  try {
    await MatchInsight.findOneAndUpdate(pair, { $set: document }, { upsert: true, runValidators: true });
  } catch (err) {
    // Two requests for the same pair raced on the upsert; the other one won.
    if (!(typeof err === "object" && err !== null && (err as { code?: number }).code === 11000)) {
      throw err;
    }
  }
  return { text: explanation.text, source: explanation.source };
}

export async function getCompatibilityWith(
  viewerId: string,
  otherId: string,
): Promise<CompatibilityLookup> {
  if (viewerId === otherId) throw ApiError.badRequest("You can't compare yourself with yourself.");

  const otherObjectId = new Types.ObjectId(otherId);
  const [viewer, otherAI, otherProfile] = await Promise.all([
    loadViewer(viewerId),
    AIProfile.findOne({ userId: otherObjectId }),
    Profile.findOne({ userId: otherObjectId }),
  ]);

  if (!otherProfile) throw ApiError.notFound("User not found.");
  if (!viewer) return { available: false, reason: "viewer_not_ready" };
  if (!otherAI) return { available: false, reason: "other_not_ready" };

  const result = calculateAICompatibility(
    toCompatibilityProfile(viewer),
    toCompatibilityProfile({
      ai: otherAI,
      basic: { interests: otherProfile.interests, relationshipGoal: otherProfile.relationshipGoal },
    }),
  );
  if (!result) return { available: false, reason: "other_not_ready" };

  // Only matched pairs get a model-written, stored explanation — that's the
  // spend we've decided is worth it. Everyone else gets the free template.
  const [oneId, twoId] = orderUserIds(viewerId, otherId);
  const isMatched = await Match.exists({
    userOne: new Types.ObjectId(oneId),
    userTwo: new Types.ObjectId(twoId),
  });

  const explanation: StoredExplanation = isMatched
    ? await getStoredExplanation(viewerId, otherId, viewer.ai, otherAI, result)
    : { text: buildTemplateExplanation(result), source: "template" };

  return {
    available: true,
    compatibility: {
      ...summarize(result),
      breakdown: result.breakdown,
      reasonDetails: result.reasons,
      explanation: explanation.text,
      explanationSource: explanation.source,
      shared: result.shared,
    },
  };
}
