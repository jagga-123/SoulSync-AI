import { deriveArchetype } from "./archetypes";
import { buildStrengths, buildSummary, clampScore, computeConfidence } from "./analysis-utils";
import {
  PROFILE_GOAL_TO_TAG,
  TRAIT_KEYS,
  normalizeInterests,
  type CommunicationStyle,
  type InterviewCategory,
  type TraitScores,
} from "./taxonomy";
import type { AnalysisInput, AnalysisResult, InterviewTurn } from "./types";

/**
 * The built-in analysis engine: keyword lexicons over the user's answers.
 * It's what runs when no AI provider is configured and when a provider fails.
 * It is intentionally simple and transparent — it can only see words, not
 * meaning — so its confidence is capped below an LLM read (see
 * computeConfidence) and the report says which engine produced it.
 */

type Lexicon = ReadonlyArray<readonly [tag: string, pattern: RegExp]>;

const VALUES: Lexicon = [
  ["personal growth", /\b(grow(th|ing)?|self[- ]improv\w*|improv(e|ing) myself|learn(ing)?|develop(ing|ment)?|better version|evolv\w*)\b/g],
  ["honesty", /\b(honest\w*|truth\w*|transparen\w*|authentic\w*|genuine|sincer\w*)\b/g],
  ["family", /\b(family|families|parents|siblings|kids|children|mother|father|mom|dad|sister|brother)\b/g],
  ["loyalty", /\b(loyal\w*|commitment|committed|faithful|trust\w*|dependab\w*|there for)\b/g],
  ["ambition", /\b(ambiti\w*|driven|goals?|success\w*|achiev\w*|hustle)\b/g],
  ["kindness", /\b(kind\w*|compassion\w*|generous|generosity|caring|considerate|helping others|giving back)\b/g],
  ["independence", /\b(independen\w*|freedom|own space|autonom\w*|self[- ]reliant)\b/g],
  ["adventure", /\b(advent\w*|explor\w*|thrill\w*|new experiences|risk)\b/g],
  ["creativity", /\b(creativ\w*|art\w*|imagin\w*|design\w*|painting|writing)\b/g],
  ["spirituality", /\b(spiritual\w*|faith|god|pray\w*|religio\w*|meditat\w*|mindful\w*)\b/g],
  ["stability", /\b(stable|stability|secure|security|settled?|routine|consisten\w*|steady)\b/g],
  ["health", /\b(health\w*|fitness|wellness|workout|exercise|gym|nutrition|well-?being)\b/g],
  ["humor", /\b(humou?r\w*|funny|laugh\w*|jokes?|witty)\b/g],
  ["curiosity", /\b(curio\w*|wonder|discover\w*|fascinat\w*)\b/g],
  ["community", /\b(communit\w*|volunteer\w*|neighbou?r\w*|charity)\b/g],
  ["financial security", /\b(financ\w*|money|saving\w*|invest\w*|debt|budget\w*)\b/g],
  ["equality", /\b(equal\w*|fair\w*|respect\w*|partnership|shared responsibilit\w*)\b/g],
  ["tradition", /\b(tradition\w*|culture\w*|customs?|heritage|rituals?)\b/g],
];

const LIFESTYLE: Lexicon = [
  ["active", /\b(active|gym|workout\w*|exercise|running|sports?|fitness|swim\w*|cycl\w*)\b/g],
  ["homebody", /\b(homebod\w*|stay(ing)? (in|home)|cozy|netflix|quiet (night|evening)s?|at home)\b/g],
  ["social", /\b(social|parties|party|gather\w*|going out|hang(ing)? out)\b/g],
  ["outdoorsy", /\b(outdoor\w*|nature|hik\w*|camp\w*|beach|mountain\w*|trail)\b/g],
  ["traveler", /\b(travel\w*|trips?|abroad|passport|backpack\w*)\b/g],
  ["foodie", /\b(food\w*|cook\w*|restaurant\w*|cuisine|baking|chef|brunch)\b/g],
  ["early riser", /\b(early (riser|bird|morning)|wake up early|morning person|sunrise)\b/g],
  ["night owl", /\b(night owl|stay up late|late nights?|nocturnal|not a morning person|midnight)\b/g],
  ["career-driven", /\b(career|ambiti\w*|work(ing)? hard|promotion|startup|business|workaholic)\b/g],
  ["balanced", /\b(balanc\w*|work[- ]life|moderation)\b/g],
  ["spontaneous", /\b(spontaneous\w*|go with the flow|last[- ]minute|impromptu|unplanned|wing it)\b/g],
  ["organized", /\b(organi[sz]ed|planner|plan ahead|schedule\w*|structured)\b/g],
  ["health-conscious", /\b(healthy|health-conscious|nutrition|diet|clean eating|vegan|vegetarian|wellness)\b/g],
  ["creative", /\b(creativ\w*|artist\w*|paint\w*|draw\w*|craft\w*|photograph\w*)\b/g],
  ["minimalist", /\b(minimalis\w*|declutter\w*|simple (life|living)|less is more)\b/g],
];

const EMOTIONAL: Lexicon = [
  ["empathetic", /\b(empath\w*|understand(ing)? (others|people|how)|put myself in|compassion\w*)\b/g],
  ["emotionally mature", /\b(mature|maturity|talk (it|things) (out|through)|take responsibility|accountab\w*|apolog\w*)\b/g],
  ["resilient", /\b(resilien\w*|bounce back|overcame|overcome|get through|tough times|persever\w*|adapt\w*)\b/g],
  ["optimistic", /\b(optimis\w*|positive|bright side|hopeful|upbeat)\b/g],
  ["calm", /\b(calm\w*|composed|level[- ]headed|relaxed|peaceful)\b/g],
  ["passionate", /\b(passion\w*|intense|deeply|fiery|all in)\b/g],
  ["introspective", /\b(reflect\w*|introspect\w*|journal\w*|overthink\w*|inner)\b/g],
  ["supportive", /\b(support\w*|encourag\w*|cheer\w*|there for|uplift\w*)\b/g],
  ["self-aware", /\b(self[- ]aware\w*|know myself|my (flaws|weaknesses)|working on (myself|my)|i realized i)\b/g],
  ["patient", /\b(patien\w*|take (my|your) time|no rush)\b/g],
  ["sensitive", /\b(sensitive|feel(s)? (things )?deeply|emotional|easily hurt)\b/g],
  ["easygoing", /\b(easy[- ]?going|laid[- ]back|flexible|low[- ]maintenance)\b/g],
];

const GOALS: Lexicon = [
  ["long-term commitment", /\b(long[- ]term|committed|serious relationship|lasting|life partner|forever|settle down|commitment)\b/g],
  ["marriage", /\b(marriage|marry|married|wife|husband|wedding|spouse)\b/g],
  ["family", /\b(kids|children|start a family|family of my own|parenthood|have a family)\b/g],
  ["casual dating", /\b(casual|no pressure|see where it goes|nothing serious|dating around)\b/g],
  ["exploring", /\b(not sure|figuring (it )?out|open to|exploring|see what happens|take it slow|no expectations)\b/g],
  ["friendship", /\b(friendship|friends first|start as friends|become friends)\b/g],
  ["companionship", /\b(companion\w*|partner in crime|someone to share|best friend|teammate)\b/g],
];

const INTERESTS: Lexicon = [
  ["travel", /\b(travel\w*|trips?|abroad|backpack\w*)\b/g],
  ["photography", /\b(photograph\w*|photos?|camera)\b/g],
  ["hiking", /\b(hik\w*|trek\w*|trails?)\b/g],
  ["cooking", /\b(cook\w*|bak(e|ing)|recipes?|chef)\b/g],
  ["music", /\b(music|guitar|piano|concerts?|singing|band|festival)\b/g],
  ["reading", /\b(reading|books?|novels?)\b/g],
  ["fitness", /\b(gym|workout\w*|fitness|lifting|crossfit|exercise)\b/g],
  ["yoga", /\b(yoga|pilates)\b/g],
  ["movies", /\b(movies?|films?|cinema|netflix|tv shows?)\b/g],
  ["gaming", /\b(gaming|gamer|video games?|playstation|xbox)\b/g],
  ["art", /\b(art|painting|drawing|sketch\w*|museum\w*|galler(y|ies))\b/g],
  ["dancing", /\b(danc\w*)\b/g],
  ["writing", /\b(writing|blog\w*|journal\w*|poetry)\b/g],
  ["cycling", /\b(cycl\w*|biking|bike)\b/g],
  ["running", /\b(running|marathon|jogging)\b/g],
  ["camping", /\b(camp\w*)\b/g],
  ["coffee", /\b(coffee|cafes?|espresso)\b/g],
  ["technology", /\b(tech\w*|coding|programming|software|gadgets?)\b/g],
  ["animals", /\b(dogs?|cats?|pets?|animals?|puppy)\b/g],
  ["gardening", /\b(garden\w*|plants?)\b/g],
  ["volunteering", /\b(volunteer\w*|charity|nonprofit)\b/g],
  ["sports", /\b(football|soccer|cricket|basketball|tennis|badminton|sports?|swimming)\b/g],
  ["meditation", /\b(meditat\w*|mindful\w*)\b/g],
  ["food", /\b(foodie|restaurants?|street food|cuisine)\b/g],
  ["fashion", /\b(fashion|thrift\w*)\b/g],
];

const STYLES: ReadonlyArray<readonly [CommunicationStyle, RegExp]> = [
  ["empathetic", /\b(listen\w*|empath\w*|feelings?|understand\w*|emotion\w*|support\w*|open up|talk (it|things) (out|through))\b/g],
  ["direct", /\b(direct\w*|honest\w*|straightforward|blunt|upfront|say what i mean|clear about)\b/g],
  ["analytical", /\b(logic\w*|rational\w*|analy\w*|facts?|reason\w*|calmly|weigh|step back|research)\b/g],
  ["expressive", /\b(express\w*|passionate|enthusias\w*|animated|talkative|vocal|out loud)\b/g],
  ["playful", /\b(jok\w*|humou?r\w*|banter|tease|teasing|silly|witty|laugh\w*)\b/g],
  ["reserved", /\b(quiet|reserved|private|my space|take time|withdraw|shy|don'?t say much|introvert\w*)\b/g],
];

const TRAIT_SIGNALS: Record<
  keyof TraitScores,
  { positive: RegExp; negative: RegExp }
> = {
  openness: {
    positive: /\b(curio\w*|explor\w*|new (things|places|experiences|cultures)|creativ\w*|art\w*|travel\w*|learn\w*|advent\w*|philosoph\w*|imagin\w*)\b/g,
    negative: /\b(routine|traditional|familiar|stick to|comfort zone)\b/g,
  },
  conscientiousness: {
    positive: /\b(plan\w*|organi[sz]ed|goals?|disciplin\w*|schedule\w*|responsib\w*|reliable|punctual|career|ambiti\w*|focus\w*)\b/g,
    negative: /\b(spontaneous\w*|last[- ]minute|go with the flow|messy|procrastinat\w*|disorgani[sz]ed)\b/g,
  },
  extraversion: {
    positive: /\b(part(y|ies)|friends|social|outgoing|energi[sz]ed by|gather\w*|crowd\w*|going out|talkative)\b/g,
    negative: /\b(introvert\w*|quiet|alone|homebod\w*|small group|solitude|reserved|recharge|my own)\b/g,
  },
  agreeableness: {
    positive: /\b(kind\w*|help\w*|support\w*|empath\w*|listen\w*|compromis\w*|understanding|caring|considerate|patien\w*|volunteer\w*)\b/g,
    negative: /\b(argu\w*|stubborn|blunt|competitive|confront\w*)\b/g,
  },
  emotionalStability: {
    positive: /\b(calm\w*|composed|resilien\w*|optimis\w*|balanced|positive|patien\w*|level[- ]headed|talk (it|things) (out|through))\b/g,
    negative: /\b(anxi\w*|overthink\w*|stress\w*|worr\w*|moody|overwhelm\w*|panic\w*)\b/g,
  },
};

const RELATIONSHIP_CATEGORIES: readonly InterviewCategory[] = ["relationship_expectations", "family"];

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/** Ranks a lexicon's tags by weighted hit count and returns the top few that
 * were actually mentioned. `weightFor` lets the turns most relevant to a
 * dimension count double. */
function rankTags(
  lexicon: Lexicon,
  turns: readonly InterviewTurn[],
  limit: number,
  weightFor: (turn: InterviewTurn) => number = () => 1,
): string[] {
  const scored = lexicon.map(([tag, pattern], order) => {
    let score = 0;
    for (const turn of turns) {
      score += countMatches(turn.answer.toLowerCase(), pattern) * weightFor(turn);
    }
    return { tag, score, order };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.tag);
}

function scoreTraits(turns: readonly InterviewTurn[]): TraitScores {
  const text = turns.map((turn) => turn.answer.toLowerCase()).join(" \n ");
  const scores = {} as TraitScores;

  for (const key of TRAIT_KEYS) {
    const { positive, negative } = TRAIT_SIGNALS[key];
    const net = countMatches(text, positive) - countMatches(text, negative);
    // tanh keeps a chatty user from saturating at 0/100 and leaves a
    // sensible spread around the neutral 50.
    scores[key] = clampScore(50 + 40 * Math.tanh(net / 6));
  }
  return scores;
}

function detectStyle(turns: readonly InterviewTurn[]): CommunicationStyle {
  const text = turns.map((turn) => turn.answer.toLowerCase()).join(" \n ");
  let best: CommunicationStyle = "balanced";
  let bestScore = 0;

  for (const [style, pattern] of STYLES) {
    const score = countMatches(text, pattern);
    if (score > bestScore) {
      bestScore = score;
      best = style;
    }
  }
  return best;
}

export function analyzeWithHeuristics(input: AnalysisInput): AnalysisResult {
  const { turns, profile } = input;

  const values = rankTags(VALUES, turns, 5, (turn) => (turn.category === "values" ? 2 : 1));
  const lifestyleTraits = rankTags(LIFESTYLE, turns, 5, (turn) =>
    turn.category === "lifestyle" ? 2 : 1,
  );
  const emotionalTraits = rankTags(EMOTIONAL, turns, 4);
  const interests = normalizeInterests(
    rankTags(INTERESTS, turns, 8, (turn) => (turn.category === "hobbies" ? 2 : 1)),
  );

  // Goals: what they said about relationships/family, seeded by the goal they
  // picked on their basic profile (a strong, explicit signal).
  const goalTurns = turns.filter((turn) => RELATIONSHIP_CATEGORIES.includes(turn.category));
  const relationshipGoals = rankTags(GOALS, goalTurns.length > 0 ? goalTurns : turns, 3);
  const profileGoal = profile ? PROFILE_GOAL_TO_TAG[profile.relationshipGoal] : undefined;
  if (profileGoal && !relationshipGoals.includes(profileGoal)) {
    relationshipGoals.unshift(profileGoal);
  }

  const traitScores = scoreTraits(turns);
  const communicationStyle = detectStyle(turns);
  const archetype = deriveArchetype(traitScores);

  const partial = {
    personalityType: archetype.name,
    communicationStyle,
    values,
    relationshipGoals: relationshipGoals.slice(0, 3),
    interests,
  };

  return {
    ...partial,
    traitScores,
    lifestyleTraits,
    emotionalTraits,
    strengths: buildStrengths(communicationStyle, emotionalTraits, values),
    summary: buildSummary(partial),
    confidenceScore: computeConfidence(turns, "heuristic"),
    analysisSource: "heuristic",
  };
}
