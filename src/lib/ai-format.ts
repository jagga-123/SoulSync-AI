import type {
  CommunicationStyle,
  CompatibilityDimension,
  CompatibilityTier,
  TraitScores,
} from "@/types/api";

/** "personal growth" → "Personal growth" (tags come from the API lowercase). */
export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "relationship_expectations" → "Relationship expectations". */
export function categoryLabel(category: string): string {
  return capitalize(category.replace(/_/g, " "));
}

export const TIER_LABELS: Record<CompatibilityTier, string> = {
  exceptional: "Exceptional match",
  strong: "Strong match",
  promising: "Promising match",
  exploring: "Worth exploring",
};

/** Tailwind classes for the score pill, per tier. */
export const TIER_STYLES: Record<CompatibilityTier, string> = {
  exceptional: "border-accent/40 bg-accent/15 text-accent",
  strong: "border-secondary/40 bg-secondary/15 text-secondary",
  promising: "border-primary/40 bg-primary/15 text-white",
  exploring: "border-white/15 bg-white/8 text-white/70",
};

export const DIMENSION_LABELS: Record<CompatibilityDimension, string> = {
  values: "Values",
  interests: "Interests",
  communication: "Communication",
  lifestyle: "Lifestyle",
  relationshipGoals: "Relationship goals",
  personality: "Personality",
};

// Mirrors the backend's archetype blurbs (backend/src/ai/archetypes.ts).
export const ARCHETYPE_TAGLINES: Record<string, string> = {
  "The Explorer": "Curious, adventurous and energised by new places and people",
  "The Nurturer": "Warm and attentive, with a talent for making people feel cared for",
  "The Visionary": "Imaginative and driven, with a clear picture of the future to build",
  "The Anchor": "Steady, dependable and calm — the person others lean on in a storm",
  "The Connector": "Sociable and generous, with a gift for bringing people together",
  "The Thinker": "Reflective and intellectually curious, with a rich inner world",
  "The Creator": "Expressive and original, drawn to making and feeling things deeply",
  "The Builder": "Disciplined and goal-oriented, turning plans into steady progress",
};

export const STYLE_DESCRIPTIONS: Record<CommunicationStyle, string> = {
  direct: "You say what you mean, clearly and kindly. People always know where they stand with you.",
  empathetic: "You lead with listening and feeling. Conversations with you leave people feeling understood.",
  analytical: "You think things through and weigh the facts before you speak — calm, reasoned, thorough.",
  playful: "You bring humor and lightness to conversation, and use it to build closeness.",
  reserved: "You're measured and private, choosing your words with care and opening up at your own pace.",
  expressive: "You share what you feel openly and with energy — enthusiasm is easy to read on you.",
  balanced: "You adapt to the moment and the person, moving comfortably between styles.",
};

export const TRAIT_META: Record<
  keyof TraitScores,
  { label: string; low: string; high: string; blurb: string }
> = {
  openness: {
    label: "Openness",
    low: "Familiar",
    high: "Adventurous",
    blurb: "Appetite for new ideas, places and experiences",
  },
  conscientiousness: {
    label: "Conscientiousness",
    low: "Spontaneous",
    high: "Organised",
    blurb: "How much you plan, commit and follow through",
  },
  extraversion: {
    label: "Extraversion",
    low: "Reflective",
    high: "Outgoing",
    blurb: "Where you get your energy — solitude or people",
  },
  agreeableness: {
    label: "Agreeableness",
    low: "Candid",
    high: "Warm",
    blurb: "How readily you cooperate, trust and care",
  },
  emotionalStability: {
    label: "Emotional stability",
    low: "Sensitive",
    high: "Steady",
    blurb: "How evenly you handle stress and change",
  },
};

export function describeTrait(key: keyof TraitScores, value: number): string {
  const { low, high } = TRAIT_META[key];
  if (value >= 65) return `Leans ${high.toLowerCase()}`;
  if (value <= 35) return `Leans ${low.toLowerCase()}`;
  return "Balanced";
}

/** Short, friendly note about how the profile was produced. */
export function analysisSourceLabel(source: "llm" | "heuristic", provider?: string): string {
  if (source === "llm") {
    const name = provider ? capitalize(provider) : "an AI model";
    return `Analysed by ${name}`;
  }
  return "Analysed by SoulSync's built-in engine";
}
