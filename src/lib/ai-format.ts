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

/**
 * How a match is described to people. The engine's four tiers (backend/src/ai/compatibility.ts:
 * 85+ / 70+ / 55+ / below) get human labels — the reasons matter more than the number.
 */
export const TIER_LABELS: Record<CompatibilityTier, string> = {
  exceptional: "You two click",
  strong: "On the same wavelength",
  promising: "Real common ground",
  exploring: "Different, in an interesting way",
};

/** One line under the label that says what the tier means. */
export const TIER_SUBLINES: Record<CompatibilityTier, string> = {
  exceptional: "You share what matters most.",
  strong: "Plenty in common — and it shows.",
  promising: "A good place to start a conversation.",
  exploring: "Less alike on paper — could be a good surprise.",
};

/**
 * Tailwind classes for the match label, per tier. The text is always white on a dark backing so it stays
 * readable over any photo (the tier shows in the border colour and the heart, never in text colour alone).
 */
export const TIER_STYLES: Record<CompatibilityTier, string> = {
  exceptional: "border-primary/70 bg-background/80 text-white",
  strong: "border-secondary/70 bg-background/80 text-white",
  promising: "border-accent/60 bg-background/80 text-white",
  exploring: "border-white/25 bg-background/80 text-white/90",
};

export const DIMENSION_LABELS: Record<CompatibilityDimension, string> = {
  values: "What matters to you",
  interests: "What you enjoy",
  communication: "How you talk",
  lifestyle: "How you live",
  relationshipGoals: "What you want",
  personality: "Who you are",
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

/** sessionStorage flag: set when an interview finishes so the report page can play its one-time "Your read is ready." arrival. */
export const REPORT_REVEAL_KEY = "soulsync:report-reveal";

/** With this few of the six areas to go on, a match is an "early read" rather than a firm one. */
export const EARLY_READ_MAX_AREAS = 3;

/** How many of the six areas both people have given us data for (dropped areas mean less to compare). */
export function availableAreaCount(breakdown: Record<CompatibilityDimension, { available: boolean }>): number {
  return Object.values(breakdown).filter((area) => area.available).length;
}
