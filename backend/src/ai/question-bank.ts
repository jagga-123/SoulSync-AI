import { INTERVIEW_CATEGORIES, type InterviewCategory } from "./taxonomy";

/**
 * Hand-written interview questions, four per category (enough to cover the
 * 25-answer maximum). They serve two roles: the built-in interviewer when no
 * AI provider is configured, and the safety net whenever a provider fails or
 * returns something unusable — the interview never stalls on an outage.
 */
export const QUESTION_BANK: Record<InterviewCategory, readonly string[]> = {
  personality: [
    "Let's start simple — tell me a bit about yourself. How would you describe who you are to someone you've just met?",
    "What are you like when you're at your best, and what do your closest friends say about you?",
    "How do you recharge after a long, demanding week — with people, or with time to yourself?",
    "What's something people often get wrong about you at first?",
  ],
  hobbies: [
    "What do you love doing in your free time? What's something you could talk about for hours?",
    "Tell me about a recent experience — a trip, a project, an event — that you truly enjoyed.",
    "Is there something you've always wanted to learn or try but haven't yet?",
    "What does a perfect weekend look like for you?",
  ],
  values: [
    "What matters most to you in life — the things you'd never compromise on?",
    "Describe a moment when you felt really proud of how you handled something. What did it say about your values?",
    "What does personal growth mean to you, and how are you working on it right now?",
    "What qualities do you admire most in other people?",
  ],
  lifestyle: [
    "Walk me through a typical day in your life right now — how does it usually go?",
    "Are you more of a planner or a go-with-the-flow person? How does that show up in daily life?",
    "How do you feel about health, fitness and the way you look after yourself?",
    "Where do you see yourself living, and what kind of home life feels right for you?",
  ],
  communication: [
    "How do you usually handle conflict or disagreement with someone you care about?",
    "When something is bothering you, do you bring it up straight away or take time to process first?",
    "How do you like to show and receive affection — words, time together, actions, something else?",
    "What makes you feel truly listened to and understood in a conversation?",
  ],
  career: [
    "What do you do for work or study, and how do you feel about it?",
    "How ambitious would you say you are, and what are you working towards professionally?",
    "How do you balance work and personal life when both are demanding?",
    "How would you feel about a partner whose career priorities look different from yours?",
  ],
  family: [
    "How would you describe your relationship with your family, and how central are they in your life?",
    "Do you see children or building a family in your future? How do you feel about that?",
    "What did you learn about relationships from the home you grew up in?",
    "How important are traditions, culture or faith to how you live?",
  ],
  relationship_expectations: [
    "What kind of partner are you looking for, and what kind of relationship do you want to build?",
    "What does a healthy, lasting relationship look like to you day to day?",
    "What are your dealbreakers — and what are the little things that would make you fall for someone?",
    "What do you hope to bring to a relationship, and what do you still want to work on?",
  ],
};

/** The category the interview covers for a given question number (0-based),
 * cycling through every category before repeating one. */
export function categoryForQuestion(index: number): InterviewCategory {
  return INTERVIEW_CATEGORIES[index % INTERVIEW_CATEGORIES.length] as InterviewCategory;
}

function normalizeQuestion(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** Picks the next unused bank question for the category. Falls back to the
 * category's first question if the whole bank has somehow been used. */
export function pickBankQuestion(
  category: InterviewCategory,
  alreadyAsked: readonly string[],
): string {
  const asked = new Set(alreadyAsked.map(normalizeQuestion));
  const options = QUESTION_BANK[category];
  const fresh = options.find((question) => !asked.has(normalizeQuestion(question)));
  return fresh ?? (options[0] as string);
}

export function isRepeatQuestion(candidate: string, alreadyAsked: readonly string[]): boolean {
  const key = normalizeQuestion(candidate);
  return alreadyAsked.some((asked) => normalizeQuestion(asked) === key);
}
