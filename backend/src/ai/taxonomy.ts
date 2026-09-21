/**
 * Controlled vocabularies for the AI profile. Constraining the analysis to
 * these lists (for everything except `interests`) is what makes two people's
 * profiles comparable — free-text traits ("loves growth" vs "self-improvement")
 * would almost never overlap — and it doubles as response sanitization: the
 * model can't smuggle arbitrary text into fields that later get shown to
 * other users.
 */

export const INTERVIEW_MIN_ANSWERS = 15;
export const INTERVIEW_MAX_ANSWERS = 25;
export const MAX_ANSWER_LENGTH = 1000;

// Order is the order the interview cycles through — easy topics first.
export const INTERVIEW_CATEGORIES = [
  "personality",
  "hobbies",
  "values",
  "lifestyle",
  "communication",
  "career",
  "family",
  "relationship_expectations",
] as const;
export type InterviewCategory = (typeof INTERVIEW_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<InterviewCategory, string> = {
  personality: "Personality",
  hobbies: "Hobbies",
  values: "Values",
  lifestyle: "Lifestyle",
  communication: "Communication",
  career: "Career",
  family: "Family",
  relationship_expectations: "Relationship expectations",
};

export const COMMUNICATION_STYLES = [
  "direct",
  "empathetic",
  "analytical",
  "playful",
  "reserved",
  "expressive",
  "balanced",
] as const;
export type CommunicationStyle = (typeof COMMUNICATION_STYLES)[number];

export const VALUE_TAGS = [
  "personal growth",
  "honesty",
  "family",
  "loyalty",
  "ambition",
  "kindness",
  "independence",
  "adventure",
  "creativity",
  "spirituality",
  "stability",
  "health",
  "humor",
  "curiosity",
  "community",
  "financial security",
  "equality",
  "tradition",
] as const;

export const LIFESTYLE_TAGS = [
  "active",
  "homebody",
  "social",
  "outdoorsy",
  "traveler",
  "foodie",
  "early riser",
  "night owl",
  "career-driven",
  "balanced",
  "spontaneous",
  "organized",
  "health-conscious",
  "creative",
  "minimalist",
] as const;

export const EMOTIONAL_TAGS = [
  "empathetic",
  "emotionally mature",
  "resilient",
  "optimistic",
  "calm",
  "passionate",
  "introspective",
  "supportive",
  "self-aware",
  "patient",
  "sensitive",
  "easygoing",
] as const;

export const GOAL_TAGS = [
  "long-term commitment",
  "marriage",
  "family",
  "casual dating",
  "exploring",
  "friendship",
  "companionship",
] as const;

/** Goals collapse into intent groups so "marriage" and "long-term
 * commitment" still read as aligned even though they aren't identical. */
export const GOAL_GROUP: Record<(typeof GOAL_TAGS)[number], "serious" | "casual" | "friendship"> = {
  "long-term commitment": "serious",
  marriage: "serious",
  family: "serious",
  "casual dating": "casual",
  exploring: "casual",
  friendship: "friendship",
  companionship: "friendship",
};

/** Maps the basic profile's single relationshipGoal onto the goal vocabulary. */
export const PROFILE_GOAL_TO_TAG: Record<string, (typeof GOAL_TAGS)[number]> = {
  serious: "long-term commitment",
  casual: "casual dating",
  friendship: "friendship",
  "not-sure": "exploring",
};

export const TRAIT_KEYS = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "emotionalStability",
] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];
export type TraitScores = Record<TraitKey, number>;

export const TRAIT_LABELS: Record<TraitKey, string> = {
  openness: "Openness",
  conscientiousness: "Conscientiousness",
  extraversion: "Extraversion",
  agreeableness: "Agreeableness",
  emotionalStability: "Emotional stability",
};

const INTEREST_ALIASES: Record<string, string> = {
  travelling: "travel",
  traveling: "travel",
  trips: "travel",
  hike: "hiking",
  hikes: "hiking",
  trekking: "hiking",
  photo: "photography",
  photos: "photography",
  "working out": "fitness",
  workout: "fitness",
  workouts: "fitness",
  gym: "fitness",
  cook: "cooking",
  baking: "cooking",
  read: "reading",
  books: "reading",
  book: "reading",
  movie: "movies",
  film: "movies",
  films: "movies",
  cinema: "movies",
  games: "gaming",
  "video games": "gaming",
  gamer: "gaming",
  dance: "dancing",
  paint: "painting",
  draw: "drawing",
  run: "running",
  jogging: "running",
  bike: "cycling",
  biking: "cycling",
  cycle: "cycling",
  camp: "camping",
  pets: "animals",
  dogs: "animals",
  cats: "animals",
  sport: "sports",
  yoga: "yoga",
  meditate: "meditation",
  write: "writing",
  gardens: "gardening",
  garden: "gardening",
  volunteer: "volunteering",
  tech: "technology",
  coding: "technology",
  programming: "technology",
  "listening to music": "music",
  concerts: "music",
};

/** Canonical form for an interest string — lowercase, punctuation-stripped,
 * aliases folded — so "Travelling" and "travel" compare equal. */
export function normalizeInterest(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9 &+'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  return INTEREST_ALIASES[cleaned] ?? cleaned;
}

export function normalizeInterests(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeInterest(value);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

/** Case/spacing-insensitive lookup of free text against a fixed vocabulary. */
export function matchVocabulary<T extends string>(vocabulary: readonly T[], value: string): T | null {
  const key = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  for (const entry of vocabulary) {
    if (entry.toLowerCase().replace(/[_-]+/g, " ") === key) return entry;
  }
  return null;
}
