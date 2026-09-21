import { findArchetype } from "./archetypes";
import { INTERVIEW_CATEGORIES, type CommunicationStyle } from "./taxonomy";
import type { AnalysisResult, AnalysisSource, InterviewTurn } from "./types";

export function joinList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] as string;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function clampScore(value: number, min = 0, max = 100): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

const STRENGTH_BY_VALUE: Record<string, string> = {
  "personal growth": "Committed to growing and learning",
  honesty: "Honest and straightforward",
  kindness: "Genuinely kind and considerate",
  loyalty: "Loyal and dependable",
  ambition: "Driven and goal-oriented",
  creativity: "Creative and expressive",
  adventure: "Adventurous spirit",
  curiosity: "Curious and open-minded",
  humor: "Quick sense of humor",
  independence: "Self-reliant and confident",
  family: "Deeply values close relationships",
  health: "Looks after their wellbeing",
  community: "Community-minded",
  stability: "Grounded and reliable",
};

const STRENGTH_BY_EMOTION: Record<string, string> = {
  empathetic: "Empathetic listener",
  "emotionally mature": "Emotionally mature under pressure",
  resilient: "Resilient in tough times",
  optimistic: "Optimistic outlook",
  calm: "Calm and grounded",
  supportive: "Supportive partner",
  "self-aware": "Self-aware and reflective",
  patient: "Patient with people",
  passionate: "Passionate and wholehearted",
  introspective: "Thoughtful and introspective",
  easygoing: "Easygoing and flexible",
  sensitive: "Emotionally attuned",
};

const STRENGTH_BY_STYLE: Record<CommunicationStyle, string> = {
  direct: "Clear, honest communicator",
  empathetic: "Communicates with warmth",
  analytical: "Thoughtful, reasoned communicator",
  playful: "Brings humor into conversation",
  reserved: "Considered, measured communicator",
  expressive: "Openly expressive",
  balanced: "Adaptable communicator",
};

/** Builds 3–5 strength phrases from an analysis' tags. Used by the built-in
 * engine, and to top up an LLM analysis that came back with too few. */
export function buildStrengths(
  style: CommunicationStyle,
  emotionalTraits: readonly string[],
  values: readonly string[],
): string[] {
  const out: string[] = [STRENGTH_BY_STYLE[style]];
  for (const trait of emotionalTraits.slice(0, 2)) {
    const phrase = STRENGTH_BY_EMOTION[trait];
    if (phrase) out.push(phrase);
  }
  for (const value of values.slice(0, 3)) {
    const phrase = STRENGTH_BY_VALUE[value];
    if (phrase) out.push(phrase);
  }
  const unique = [...new Set(out)].slice(0, 5);
  if (unique.length < 3) unique.push("Thoughtful and self-reflective");
  return unique;
}

export function buildSummary(
  result: Pick<
    AnalysisResult,
    "personalityType" | "communicationStyle" | "values" | "relationshipGoals" | "interests"
  >,
): string {
  const archetype = findArchetype(result.personalityType);
  const parts: string[] = [];

  parts.push(
    archetype
      ? `You come across as ${archetype.name.toLowerCase()} — ${archetype.blurb}.`
      : "You come across as thoughtful and self-aware.",
  );
  if (result.values.length > 0) {
    parts.push(`What matters most to you: ${joinList(result.values.slice(0, 3))}.`);
  }
  const article = /^[aeiou]/i.test(result.communicationStyle) ? "an" : "a";
  parts.push(
    result.communicationStyle === "balanced"
      ? "You adapt the way you communicate to the moment and the person."
      : `You tend to communicate in ${article} ${result.communicationStyle} way.`,
  );
  if (result.relationshipGoals.length > 0) {
    parts.push(`You're looking for ${joinList(result.relationshipGoals.slice(0, 2))}.`);
  }
  if (result.interests.length > 0) {
    parts.push(`You light up around ${joinList(result.interests.slice(0, 3))}.`);
  }
  return parts.join(" ");
}

/**
 * How much to trust an analysis, 0–100, from things we can measure about the
 * interview itself: how many answers, how much was said in each, and how many
 * of the eight topics were touched. A model's self-reported confidence would
 * be unverifiable; this is reproducible. The built-in engine is keyword-based
 * and is capped lower than an LLM read.
 */
export function computeConfidence(turns: readonly InterviewTurn[], source: AnalysisSource): number {
  if (turns.length === 0) return 0;

  const wordCounts = turns.map((turn) => turn.answer.trim().split(/\s+/).filter(Boolean).length);
  const avgWords = wordCounts.reduce((sum, count) => sum + count, 0) / turns.length;

  const covered = new Set(turns.filter((turn) => turn.answer.trim().length > 0).map((turn) => turn.category));
  const coverage = covered.size / INTERVIEW_CATEGORIES.length;
  const depth = Math.min(1, avgWords / 25);
  const volume = Math.min(1, turns.length / 20);

  const raw = 0.4 * depth + 0.3 * volume + 0.3 * coverage;
  const ceiling = source === "llm" ? 95 : 70;
  return clampScore(raw * ceiling);
}
