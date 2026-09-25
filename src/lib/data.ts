import {
  HeartHandshake,
  Lock,
  MessageCircle,
  MessageCircleHeart,
  RefreshCw,
} from "lucide-react";

import { TIER_LABELS, TIER_SUBLINES } from "@/lib/ai-format";
import type {
  AiPoint,
  Feature,
  FoundingNote,
  FaqItem,
  MatchArea,
  NavLink,
  ProcessStep,
  TrustFact,
} from "@/types";

/*
 * Landing-page content.
 *
 * House rule: every statement here must be provable from the product itself — no invented metrics,
 * no invented people, no features that don't exist. Anything illustrative is labelled "Example" where
 * it is shown. If a claim can't point at code or a real query, it doesn't belong on this page.
 */

/** The project's public source code (the repository is public). */
export const SOURCE_CODE_URL = "https://github.com/jagga-123/SoulSync-AI";

export const NAV_LINKS: NavLink[] = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Why it works", href: "/#matchmaking" },
  { label: "Our AI", href: "/#our-ai" },
  { label: "FAQ", href: "/#faq" },
];

/** Three facts that are true today (interview length: interview-view intro; six areas: compatibility engine; privacy: public-profile shape). */
export const TRUST_FACTS: TrustFact[] = [
  {
    title: "Chat, don't swipe",
    description: "15–25 friendly questions, about ten minutes. That's your whole setup.",
    icon: MessageCircleHeart,
  },
  {
    title: "Matches come with reasons",
    description: "We compare six things and tell you what you have in common, in plain words.",
    icon: HeartHandshake,
  },
  {
    title: "Your report is yours",
    description: "Only you see your full personality report. Matches see just what you share.",
    icon: Lock,
  },
];

/**
 * What the compatibility engine compares and how much each area counts.
 * Mirrors COMPATIBILITY_WEIGHTS in backend/src/ai/compatibility.ts — update both together.
 */
export const MATCH_AREAS: MatchArea[] = [
  { label: "What matters to you", weight: 25, description: "Your values — what you care about most." },
  { label: "What you enjoy", weight: 20, description: "The interests and activities you love." },
  { label: "How you talk", weight: 15, description: "How you like to connect and talk things through." },
  { label: "How you live", weight: 15, description: "Your pace, habits and how you spend your time." },
  { label: "What you want", weight: 15, description: "What you're each looking for in a relationship." },
  { label: "Who you are", weight: 10, description: "Your temperament and how you show up." },
];

export const PROCESS_STEPS: ProcessStep[] = [
  {
    index: "01",
    title: "Have a conversation",
    description:
      "Sol, our AI interviewer, asks 15–25 friendly questions and builds on each answer. Say it your way — there are no wrong answers.",
    icon: MessageCircleHeart,
  },
  {
    index: "02",
    title: "See who fits — and why",
    description:
      "We compare your values, interests, how you communicate, your lifestyle, what you want and your personality. Every match shows you the reasons.",
    icon: HeartHandshake,
  },
  {
    index: "03",
    title: "Say hello",
    description:
      "When you both say yes, start chatting. You stay in control: pass, block or report anyone, any time.",
    icon: MessageCircle,
  },
];

export const FEATURES: Feature[] = [
  {
    title: "Conversation first",
    description:
      "Your profile is built from what you say, not what you tick. Our AI asks, you answer in your own words.",
    icon: MessageCircleHeart,
  },
  {
    title: "Reasons, not mystery scores",
    description:
      "Every match comes with a plain-English explanation and the interests, values and goals you share.",
    icon: HeartHandshake,
  },
  {
    title: "Private by design",
    description: "Your full report is visible only to you. We never send marketing email.",
    icon: Lock,
  },
];

/**
 * Real quotes from real, consenting members — first name (and city, if they agree) only.
 * The "Founding notes" block renders nothing until there are at least three, so add entries here
 * only when a member has actually said them and agreed to be quoted. Never invent one.
 */
export const FOUNDING_NOTES: FoundingNote[] = [];
export const MIN_FOUNDING_NOTES = 3;

/* ---- "Not a score. A reason." showcase — one fictional pair, always labelled "Example" ---- */

export const SHOWCASE = {
  people: [
    { name: "Aria", age: 27, initials: "A", gradient: "from-primary to-secondary" },
    { name: "Noah", age: 29, initials: "N", gradient: "from-accent to-primary" },
  ],
  label: TIER_LABELS.exceptional,
  sublabel: TIER_SUBLINES.exceptional,
  /** Mirrors the wording of the engine's real reason templates (backend/src/ai/compatibility.ts). */
  reasons: [
    "You both value honesty and personal growth",
    "You both enjoy hiking, cooking and travel",
    "Your communication styles complement each other",
  ],
  /** Hearts (1–5) for each area of MATCH_AREAS, in the same order — illustrative. */
  hearts: [5, 4, 4, 3, 5, 4],
};

/** "Being honest about the AI" — each line is true today. */
export const AI_POINTS: AiPoint[] = [
  {
    title: "Sol is an AI, not a person",
    body: "It asks the questions and writes a summary of what you told it.",
    icon: MessageCircleHeart,
  },
  {
    title: "Your answers are processed by AI services",
    body: "We use outside AI providers to write your report, and we keep your answers in your account so we can match you. Only you see the full report.",
    icon: Lock,
  },
  {
    title: "It suggests. You decide.",
    body: "The AI suggests people and tells you why. It never decides who you talk to.",
    icon: HeartHandshake,
  },
  {
    title: "It can be wrong",
    body: "If a match doesn't feel right, pass on it — and you can redo the interview any time.",
    icon: RefreshCw,
  },
];

/** Landing-page FAQ. Every answer describes what the product does today — no promises about features that don't exist yet. */
export const FAQ_ITEMS: FaqItem[] = [
  {
    q: "Is SoulSync free?",
    a: "Yes. You can join, do the interview and get your report and matches for free. Free accounts have a daily limit on likes; paid plans are opening soon — the Pricing page shows exactly what each one includes.",
  },
  {
    q: "How long does the interview take?",
    a: "About ten minutes: 15 to 25 friendly questions. You can stop after 15 answers and pick it back up any time.",
  },
  {
    q: "Can I use SoulSync without doing the interview?",
    a: "Yes, you can browse people straight away. The interview is what unlocks personal suggestions and the reasons behind each match.",
  },
  {
    q: "Who can see my personality report?",
    a: "Only you. Your matches see what you have in common, not your full report.",
  },
  {
    q: "Is Sol a real person?",
    a: "No. Sol is an AI. It writes the questions and your summary. Real people only appear when you match and start chatting.",
  },
  {
    q: "What happens to my answers?",
    a: "They're sent to outside AI services so Sol can write questions and your report, and they're stored in your account so we can match you. Only you can see them.",
  },
  {
    q: "What if I don't like my matches?",
    a: "You never have to act on a suggestion — just move on. You can block anyone, and you can redo your interview whenever you like.",
  },
  {
    q: "How do you keep people safe?",
    a: "You can report or block anyone from their profile or a chat, at any time. Reports go to our moderation team.",
  },
];
