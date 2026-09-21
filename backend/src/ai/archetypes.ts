import { TRAIT_KEYS, type TraitScores } from "./taxonomy";

export interface Archetype {
  name: string;
  blurb: string;
  /** The trait profile this archetype is closest to (0–100 per trait). */
  ideal: TraitScores;
}

export const ARCHETYPES: readonly Archetype[] = [
  {
    name: "The Explorer",
    blurb: "curious, adventurous and energised by new places and people",
    ideal: { openness: 85, conscientiousness: 45, extraversion: 75, agreeableness: 60, emotionalStability: 60 },
  },
  {
    name: "The Nurturer",
    blurb: "warm and attentive, with a talent for making people feel cared for",
    ideal: { openness: 55, conscientiousness: 60, extraversion: 55, agreeableness: 88, emotionalStability: 65 },
  },
  {
    name: "The Visionary",
    blurb: "imaginative and driven, with a clear picture of the future to build",
    ideal: { openness: 85, conscientiousness: 78, extraversion: 55, agreeableness: 45, emotionalStability: 65 },
  },
  {
    name: "The Anchor",
    blurb: "steady, dependable and calm — the person others lean on in a storm",
    ideal: { openness: 40, conscientiousness: 80, extraversion: 45, agreeableness: 65, emotionalStability: 82 },
  },
  {
    name: "The Connector",
    blurb: "sociable and generous, with a gift for bringing people together",
    ideal: { openness: 60, conscientiousness: 50, extraversion: 88, agreeableness: 78, emotionalStability: 60 },
  },
  {
    name: "The Thinker",
    blurb: "reflective and intellectually curious, with a rich inner world",
    ideal: { openness: 80, conscientiousness: 60, extraversion: 25, agreeableness: 50, emotionalStability: 60 },
  },
  {
    name: "The Creator",
    blurb: "expressive and original, drawn to making and feeling things deeply",
    ideal: { openness: 88, conscientiousness: 35, extraversion: 50, agreeableness: 55, emotionalStability: 45 },
  },
  {
    name: "The Builder",
    blurb: "disciplined and goal-oriented, turning plans into steady progress",
    ideal: { openness: 45, conscientiousness: 88, extraversion: 55, agreeableness: 55, emotionalStability: 70 },
  },
];

/** Deterministically picks the archetype whose ideal trait profile is
 * nearest (Euclidean distance) to the person's trait scores. Deriving the
 * label from the numbers — rather than letting a model free-text one — keeps
 * it consistent across providers and reproducible. */
export function deriveArchetype(traits: TraitScores): Archetype {
  let best = ARCHETYPES[0] as Archetype;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const archetype of ARCHETYPES) {
    let sum = 0;
    for (const key of TRAIT_KEYS) {
      const diff = traits[key] - archetype.ideal[key];
      sum += diff * diff;
    }
    if (sum < bestDistance) {
      bestDistance = sum;
      best = archetype;
    }
  }
  return best;
}

export function findArchetype(name: string): Archetype | undefined {
  return ARCHETYPES.find((archetype) => archetype.name === name);
}
