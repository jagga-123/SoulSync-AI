import {
  HeartHandshake,
  Lock,
  MessageCircle,
  MessageCircleHeart,
} from "lucide-react";

import { TIER_LABELS } from "@/lib/ai-format";
import type {
  ExampleProfile,
  Feature,
  FoundingNote,
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
  { label: "See an example", href: "/#matching-demo" },
  { label: "What's different", href: "/#features" },
  { label: "Early access", href: "/#early-access" },
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

/** Fictional people for the hero illustration — shown with an "Example" caption. Labels use the real match wording. */
export const EXAMPLE_PROFILES: ExampleProfile[] = [
  {
    name: "Aria",
    age: 27,
    role: "Product Designer",
    label: TIER_LABELS.exceptional,
    initials: "A",
    gradient: "from-primary to-secondary",
  },
  {
    name: "Noah",
    age: 29,
    role: "Music Producer",
    label: TIER_LABELS.strong,
    initials: "N",
    gradient: "from-accent to-secondary",
  },
  {
    name: "Maya",
    age: 26,
    role: "Marine Biologist",
    label: TIER_LABELS.promising,
    initials: "M",
    gradient: "from-secondary to-primary",
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

/* ---- The scroll-through demo ("See an example") — all fictional, labelled "Example" ---- */

export const DEMO_INPUTS: string[] = [
  "Introvert",
  "Loves books",
  "Wants a serious relationship",
];

/** What the demo "notices" about the example answers — plain sentences, no scores. */
export const DEMO_NOTICED: string[] = [
  "Recharges with quiet, one-to-one time",
  "Prefers a real conversation to small talk",
  "Is looking for something long-term",
];

export const DEMO_MATCH = {
  name: "Elena",
  age: 28,
  role: "Novelist & Editor",
  label: TIER_LABELS.exceptional,
  initials: "E",
  gradient: "from-primary to-secondary",
  reasons: [
    "You both recharge with quiet nights in, not crowded rooms",
    "You both love getting lost in a good book",
    "You're both looking for something long-term",
  ],
};

export const MATCHING_STAGES = [
  { key: "listening", label: "Listening", caption: "Reading what you shared…" },
  { key: "noticing", label: "Noticing", caption: "Noticing what matters to you…" },
  { key: "comparing", label: "Comparing", caption: "Comparing six things you share…" },
  { key: "introducing", label: "Introducing", caption: "Here's someone you might click with." },
] as const;
