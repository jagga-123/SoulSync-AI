import { joinList } from "./analysis-utils";
import {
  GOAL_GROUP,
  PROFILE_GOAL_TO_TAG,
  normalizeInterests,
  type CommunicationStyle,
  type TraitScores,
} from "./taxonomy";
import type { CompatibilityProfile } from "./types";

/**
 * SoulSync's AI compatibility engine. Six dimensions, each scored 0–1 and
 * weighted to a 0–100 total. It is deliberately deterministic and cheap — no
 * model call — so it can score a whole Discover page instantly; the AI is used
 * to *describe* a match (see explanation.ts), not to score it.
 *
 * Dimensions a person hasn't produced data for (e.g. no lifestyle tags) are
 * dropped and the remaining weights renormalized, so missing data never reads
 * as incompatibility.
 */
export const COMPATIBILITY_WEIGHTS = {
  values: 25,
  interests: 20,
  communication: 15,
  lifestyle: 15,
  relationshipGoals: 15,
  personality: 10,
} as const;

export type CompatibilityDimension = keyof typeof COMPATIBILITY_WEIGHTS;
export type CompatibilityTier = "exceptional" | "strong" | "promising" | "exploring";

export interface DimensionScore {
  /** 0–100. */
  score: number;
  weight: number;
  available: boolean;
}

export interface CompatibilityReason {
  dimension: CompatibilityDimension;
  text: string;
}

export interface AICompatibility {
  score: number;
  tier: CompatibilityTier;
  breakdown: Record<CompatibilityDimension, DimensionScore>;
  reasons: CompatibilityReason[];
  shared: {
    interests: string[];
    values: string[];
    lifestyleTraits: string[];
    relationshipGoals: string[];
  };
}

// How well two communication styles work together (symmetric, 0–1). Same
// style is best; pairings that tend to complement each other (empathetic +
// expressive, direct + analytical) score above ones that tend to grate
// (reserved + expressive).
const STYLE_COMPATIBILITY: Record<CommunicationStyle, Record<CommunicationStyle, number>> = {
  direct: { direct: 1, empathetic: 0.65, analytical: 0.85, playful: 0.6, reserved: 0.55, expressive: 0.6, balanced: 0.8 },
  empathetic: { direct: 0.65, empathetic: 1, analytical: 0.7, playful: 0.8, reserved: 0.75, expressive: 0.9, balanced: 0.85 },
  analytical: { direct: 0.85, empathetic: 0.7, analytical: 1, playful: 0.55, reserved: 0.8, expressive: 0.5, balanced: 0.8 },
  playful: { direct: 0.6, empathetic: 0.8, analytical: 0.55, playful: 1, reserved: 0.5, expressive: 0.9, balanced: 0.8 },
  reserved: { direct: 0.55, empathetic: 0.75, analytical: 0.8, playful: 0.5, reserved: 1, expressive: 0.45, balanced: 0.8 },
  expressive: { direct: 0.6, empathetic: 0.9, analytical: 0.5, playful: 0.9, reserved: 0.45, expressive: 1, balanced: 0.8 },
  balanced: { direct: 0.8, empathetic: 0.85, analytical: 0.8, playful: 0.8, reserved: 0.8, expressive: 0.8, balanced: 1 },
};

// Lifestyle tags that pull in opposite directions.
const LIFESTYLE_CONFLICTS: ReadonlyArray<readonly [string, string]> = [
  ["early riser", "night owl"],
  ["homebody", "social"],
  ["spontaneous", "organized"],
];
const LIFESTYLE_CONFLICT_PENALTY = 0.2;

// Personality: how much each trait matters, and whether "similar" alone is
// enough. Extraversion tolerates a moderate gap; agreeableness and emotional
// stability are additionally rewarded for being high (two low-agreeableness
// people are similar, but not a good sign).
const TRAIT_WEIGHTS: Record<keyof TraitScores, number> = {
  openness: 0.2,
  conscientiousness: 0.2,
  extraversion: 0.15,
  agreeableness: 0.25,
  emotionalStability: 0.2,
};

/** Cosine similarity of two sets (|A∩B| / √(|A|·|B|)), or null if either is
 * empty. Gentler than Jaccard when people list different numbers of tags. */
function setSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number | null {
  if (a.size === 0 || b.size === 0) return null;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared / Math.sqrt(a.size * b.size);
}

function intersection(a: readonly string[], b: readonly string[]): string[] {
  const bSet = new Set(b);
  return a.filter((item) => bSet.has(item));
}

function lifestyleScore(a: readonly string[], b: readonly string[]): number | null {
  const base = setSimilarity(new Set(a), new Set(b));
  if (base === null) return null;

  let penalty = 0;
  for (const [x, y] of LIFESTYLE_CONFLICTS) {
    if ((a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x))) {
      penalty += LIFESTYLE_CONFLICT_PENALTY;
    }
  }
  return Math.max(0, base - penalty);
}

function goalsScore(a: readonly string[], b: readonly string[]): number | null {
  const exact = setSimilarity(new Set(a), new Set(b));
  if (exact === null) return null;

  const groups = (tags: readonly string[]) =>
    new Set(tags.map((tag) => GOAL_GROUP[tag as keyof typeof GOAL_GROUP]).filter(Boolean));
  const grouped = setSimilarity(groups(a), groups(b)) ?? 0;

  return 0.5 * exact + 0.5 * grouped;
}

function personalityScore(a: CompatibilityProfile, b: CompatibilityProfile): number | null {
  if (!a.traitScores || !b.traitScores) return null;

  let traitSimilarity = 0;
  for (const key of Object.keys(TRAIT_WEIGHTS) as (keyof TraitScores)[]) {
    const x = a.traitScores[key];
    const y = b.traitScores[key];
    const gap = Math.abs(x - y);

    let similarity: number;
    if (key === "extraversion") {
      similarity = Math.max(0, 1 - Math.max(0, gap - 20) / 80);
    } else if (key === "agreeableness" || key === "emotionalStability") {
      similarity = (1 - gap / 100) * (0.5 + (0.5 * Math.min(x, y)) / 100);
    } else {
      similarity = 1 - gap / 100;
    }
    traitSimilarity += TRAIT_WEIGHTS[key] * similarity;
  }

  const emotional = setSimilarity(new Set(a.emotionalTraits), new Set(b.emotionalTraits));
  return emotional === null ? traitSimilarity : 0.7 * traitSimilarity + 0.3 * emotional;
}

function tierFor(score: number): CompatibilityTier {
  if (score >= 85) return "exceptional";
  if (score >= 70) return "strong";
  if (score >= 55) return "promising";
  return "exploring";
}

function buildReasons(
  a: CompatibilityProfile,
  b: CompatibilityProfile,
  raw: Record<CompatibilityDimension, number | null>,
  shared: AICompatibility["shared"],
): CompatibilityReason[] {
  const candidates: Array<CompatibilityReason & { priority: number }> = [];
  const add = (dimension: CompatibilityDimension, text: string) => {
    const value = raw[dimension] ?? 0;
    candidates.push({ dimension, text, priority: COMPATIBILITY_WEIGHTS[dimension] * value });
  };

  if (shared.values.length > 0) {
    add("values", `You both value ${joinList(shared.values.slice(0, 3))}`);
  }
  if (shared.interests.length > 0) {
    add("interests", `You both enjoy ${joinList(shared.interests.slice(0, 3))}`);
  }

  if ((raw.communication ?? 0) >= 0.75 && a.communicationStyle && b.communicationStyle) {
    if (a.communicationStyle === b.communicationStyle) {
      const label = a.communicationStyle === "balanced" ? "adaptable" : a.communicationStyle;
      add("communication", `Your communication styles are closely aligned — you're both ${label}`);
    } else {
      add(
        "communication",
        `Your ${a.communicationStyle} and ${b.communicationStyle} communication styles complement each other`,
      );
    }
  }

  if (shared.lifestyleTraits.length > 0 && (raw.lifestyle ?? 0) >= 0.4) {
    add("lifestyle", `Your lifestyles fit together — you're both ${joinList(shared.lifestyleTraits.slice(0, 3))}`);
  }

  if (shared.relationshipGoals.length > 0) {
    add("relationshipGoals", `You're both looking for ${joinList(shared.relationshipGoals.slice(0, 2))}`);
  } else if ((raw.relationshipGoals ?? 0) >= 0.4) {
    add("relationshipGoals", "Your relationship goals point in the same direction");
  }

  if ((raw.personality ?? 0) >= 0.7) {
    add("personality", "Your personalities and emotional styles are well matched");
  }

  return candidates
    .sort((x, y) => y.priority - x.priority)
    .slice(0, 4)
    .map(({ dimension, text }) => ({ dimension, text }));
}

/**
 * Scores two people 0–100 across values, interests, communication style,
 * lifestyle, relationship goals and personality. Returns null when there is
 * nothing comparable at all.
 */
export function calculateAICompatibility(
  a: CompatibilityProfile,
  b: CompatibilityProfile,
): AICompatibility | null {
  const raw: Record<CompatibilityDimension, number | null> = {
    values: setSimilarity(new Set(a.values), new Set(b.values)),
    interests: setSimilarity(new Set(a.interests), new Set(b.interests)),
    communication:
      a.communicationStyle && b.communicationStyle
        ? STYLE_COMPATIBILITY[a.communicationStyle][b.communicationStyle]
        : null,
    lifestyle: lifestyleScore(a.lifestyleTraits, b.lifestyleTraits),
    relationshipGoals: goalsScore(a.relationshipGoals, b.relationshipGoals),
    personality: personalityScore(a, b),
  };

  let weighted = 0;
  let availableWeight = 0;
  const breakdown = {} as Record<CompatibilityDimension, DimensionScore>;

  for (const dimension of Object.keys(COMPATIBILITY_WEIGHTS) as CompatibilityDimension[]) {
    const weight = COMPATIBILITY_WEIGHTS[dimension];
    const value = raw[dimension];
    const available = value !== null;
    breakdown[dimension] = { score: available ? Math.round(value * 100) : 0, weight, available };
    if (available) {
      weighted += weight * value;
      availableWeight += weight;
    }
  }

  if (availableWeight === 0) return null;

  const score = Math.min(100, Math.max(0, Math.round((weighted / availableWeight) * 100)));
  const shared = {
    interests: intersection(a.interests, b.interests),
    values: intersection(a.values, b.values),
    lifestyleTraits: intersection(a.lifestyleTraits, b.lifestyleTraits),
    relationshipGoals: intersection(a.relationshipGoals, b.relationshipGoals),
  };

  return {
    score,
    tier: tierFor(score),
    breakdown,
    reasons: buildReasons(a, b, raw, shared),
    shared,
  };
}

/** The template explanation: reasons as sentences plus a tier-appropriate
 * closing line. Used when no AI provider is available (and for pairs we
 * don't spend a model call on). */
export function buildTemplateExplanation(result: AICompatibility): string {
  const sentences = result.reasons.slice(0, 3).map((reason) => `${reason.text}.`);

  const closing: Record<CompatibilityTier, string> = {
    exceptional: "Overall, this looks like an exceptional match.",
    strong: "Overall, this looks like a strong match.",
    promising: "There's real potential here worth exploring.",
    exploring:
      "You may have less in common on paper, but differences can make for interesting conversations.",
  };

  if (sentences.length === 0) {
    return "Your profiles differ on paper — a conversation might reveal what the numbers can't.";
  }
  return `${sentences.join(" ")} ${closing[result.tier]}`;
}

interface AIProfileFields {
  interests: readonly string[];
  communicationStyle: CommunicationStyle;
  values: readonly string[];
  lifestyleTraits: readonly string[];
  emotionalTraits: readonly string[];
  relationshipGoals: readonly string[];
  traitScores: TraitScores;
}

interface BasicProfileFields {
  interests: readonly string[];
  relationshipGoal: string;
}

/** Combines a person's AI profile with their basic profile: interests from
 * both (normalized so "Travelling" = "travel"), and their stated relationship
 * goal folded into the AI-derived goal tags. */
export function buildCompatibilityProfile(
  ai: AIProfileFields,
  profile: BasicProfileFields | null,
): CompatibilityProfile {
  const interests = normalizeInterests([...ai.interests, ...(profile?.interests ?? [])]);

  const goals = new Set<string>(ai.relationshipGoals);
  const profileGoal = profile ? PROFILE_GOAL_TO_TAG[profile.relationshipGoal] : undefined;
  if (profileGoal) goals.add(profileGoal);

  return {
    interests,
    communicationStyle: ai.communicationStyle,
    values: [...ai.values],
    lifestyleTraits: [...ai.lifestyleTraits],
    emotionalTraits: [...ai.emotionalTraits],
    relationshipGoals: [...goals],
    traitScores: ai.traitScores,
  };
}
