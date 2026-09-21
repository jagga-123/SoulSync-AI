interface CompatibilityInput {
  interests: string[];
  relationshipGoal: string;
  city: string;
}

export interface CompatibilityResult {
  score: number;
  sharedInterests: string[];
}

// Same relationship goal and same city are binary — either true or false —
// so they contribute their full weight or nothing. Shared interests aren't
// binary, so that weight scales with overlap (Jaccard similarity: shared /
// union) rather than being all-or-nothing for a single matching interest.
const INTEREST_WEIGHT = 50;
const GOAL_WEIGHT = 30;
const CITY_WEIGHT = 20;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function calculateCompatibility(
  a: CompatibilityInput,
  b: CompatibilityInput,
): CompatibilityResult {
  const aInterests = new Set(a.interests.map(normalize));
  const bInterests = new Set(b.interests.map(normalize));

  const sharedInterests = b.interests.filter((interest) => aInterests.has(normalize(interest)));
  const unionSize = new Set([...aInterests, ...bInterests]).size;

  const interestScore = unionSize > 0 ? (sharedInterests.length / unionSize) * INTEREST_WEIGHT : 0;
  const goalScore = normalize(a.relationshipGoal) === normalize(b.relationshipGoal) ? GOAL_WEIGHT : 0;
  const cityScore = normalize(a.city) === normalize(b.city) ? CITY_WEIGHT : 0;

  const score = Math.round(interestScore + goalScore + cityScore);

  return {
    score: Math.min(100, Math.max(0, score)),
    sharedInterests,
  };
}
