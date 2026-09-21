import {
  Brain,
  Gauge,
  MessageSquareText,
  ShieldCheck,
  Fingerprint,
  CalendarHeart,
  MessageCircleHeart,
  Sparkles,
  HeartHandshake,
} from "lucide-react";

import type {
  NavLink,
  PersonalityTrait,
  ProcessStep,
  Feature,
  Testimonial,
  TrustStat,
  ProfileCard,
} from "@/types";

export const NAV_LINKS: NavLink[] = [
  { label: "Matchmaking", href: "#matchmaking" },
  { label: "Live demo", href: "#matching-demo" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Stories", href: "#testimonials" },
];

export const TRUST_STATS: TrustStat[] = [
  { value: 2.4, decimals: 1, suffix: "M+", label: "Matches Created" },
  { value: 94, suffix: "%", label: "Compatibility Accuracy" },
  { value: 150, suffix: "+", label: "Countries" },
];

export const PROFILE_CARDS: ProfileCard[] = [
  {
    name: "Aria",
    age: 27,
    role: "Product Designer",
    match: 96,
    initials: "A",
    gradient: "from-primary to-secondary",
  },
  {
    name: "Noah",
    age: 29,
    role: "Music Producer",
    match: 91,
    initials: "N",
    gradient: "from-accent to-secondary",
  },
  {
    name: "Maya",
    age: 26,
    role: "Marine Biologist",
    match: 88,
    initials: "M",
    gradient: "from-secondary to-primary",
  },
];

export const PERSONALITY_TRAITS: PersonalityTrait[] = [
  {
    label: "Emotional Intelligence",
    value: 92,
    description: "How you read, express, and respond to emotion.",
  },
  {
    label: "Communication Style",
    value: 88,
    description: "The rhythm and openness of how you connect.",
  },
  {
    label: "Core Values Alignment",
    value: 95,
    description: "Shared beliefs about what truly matters.",
  },
  {
    label: "Lifestyle Compatibility",
    value: 84,
    description: "Pace, habits, and how you spend your time.",
  },
];

export const PROCESS_STEPS: ProcessStep[] = [
  {
    index: "01",
    title: "AI Interview",
    description:
      "Have a natural, guided conversation with our AI. No boring forms, just honest questions that reveal who you really are.",
    icon: MessageCircleHeart,
  },
  {
    index: "02",
    title: "Smart Matching",
    description:
      "Our neural matching engine analyzes 200+ compatibility signals to surface people who genuinely align with you.",
    icon: Sparkles,
  },
  {
    index: "03",
    title: "Meaningful Connections",
    description:
      "Skip the small talk. Get AI-suggested conversation starters and date ideas built for real chemistry.",
    icon: HeartHandshake,
  },
];

export const FEATURES: Feature[] = [
  {
    title: "AI Personality Analysis",
    description:
      "Deep-learning models map your personality across 12 dimensions in minutes, not weeks of guesswork.",
    icon: Brain,
  },
  {
    title: "Compatibility Scoring",
    description:
      "Every match comes with a transparent, explainable score, so you always know why you were paired.",
    icon: Gauge,
  },
  {
    title: "Smart Conversations",
    description:
      "AI-crafted icebreakers keep every conversation flowing naturally toward a real connection.",
    icon: MessageSquareText,
  },
  {
    title: "Privacy First",
    description:
      "Your data is encrypted end-to-end and never sold. You decide exactly what gets shared, always.",
    icon: ShieldCheck,
  },
  {
    title: "Secure Matching",
    description:
      "Verified profiles and on-device photo checks keep the community safe, real, and authentic.",
    icon: Fingerprint,
  },
  {
    title: "Date Planning",
    description:
      "Personalized date ideas generated from both your interests, mapped to whatever city you're in.",
    icon: CalendarHeart,
  },
];

export const TESTIMONIALS: Testimonial[] = [
  {
    name: "Aanya & Rohit",
    location: "Bengaluru, India",
    quote:
      "SoulSync understood what I wanted before I could put it into words. Three months in and it still feels like magic.",
    rating: 5,
    initials: "AR",
  },
  {
    name: "Priya Sharma",
    location: "Mumbai, India",
    quote:
      "The compatibility score wasn't just a number, every match actually made sense once we talked.",
    rating: 5,
    initials: "PS",
  },
  {
    name: "Marcus Tan",
    location: "Austin, USA",
    quote:
      "I'd tried every app out there. This is the first one that felt like it actually knew me.",
    rating: 5,
    initials: "MT",
  },
  {
    name: "Sofia Reyes",
    location: "Lisbon, Portugal",
    quote:
      "The AI interview felt like therapy in the best way. My match gets my humor immediately.",
    rating: 5,
    initials: "SR",
  },
  {
    name: "Jordan Kim",
    location: "Toronto, Canada",
    quote:
      "Meaningful connections, not endless swiping. That promise actually held true for me.",
    rating: 5,
    initials: "JK",
  },
  {
    name: "Emily & Sam",
    location: "London, UK",
    quote:
      "We got engaged eight months after matching. SoulSync saw something we hadn't seen yet.",
    rating: 5,
    initials: "ES",
  },
  {
    name: "Diego Morales",
    location: "Mexico City, Mexico",
    quote:
      "The date planning feature alone is worth it. Zero effort, genuinely great first dates.",
    rating: 5,
    initials: "DM",
  },
  {
    name: "Hana Yoshida",
    location: "Seoul, South Korea",
    quote:
      "Privacy was my biggest worry. SoulSync made me feel safe from the very first message.",
    rating: 5,
    initials: "HY",
  },
];

export const DEMO_INPUTS: string[] = [
  "Introvert",
  "Loves books",
  "Wants a serious relationship",
];

export const DEMO_TRAITS: PersonalityTrait[] = [
  {
    label: "Introversion",
    value: 91,
    description: "Recharges through quiet, one-on-one time.",
  },
  {
    label: "Depth over small talk",
    value: 88,
    description: "Prefers meaningful conversation from the very start.",
  },
  {
    label: "Commitment readiness",
    value: 95,
    description: "Actively looking for something long-term.",
  },
];

export const DEMO_MATCH = {
  name: "Elena",
  age: 28,
  role: "Novelist & Editor",
  match: 96,
  initials: "E",
  gradient: "from-primary to-secondary",
  reasons: [
    "Both recharge with quiet nights in, not crowded rooms",
    "Shares your love of getting lost in a good book",
    "Looking for the same kind of long-term commitment",
  ],
};

export const MATCHING_STAGES = [
  {
    key: "thinking",
    label: "AI Thinking",
    caption: "Reading your answers…",
  },
  {
    key: "analysis",
    label: "Personality Analysis",
    caption: "Mapping your traits…",
  },
  {
    key: "calculation",
    label: "Compatibility Calculation",
    caption: "Scanning for alignment…",
  },
  {
    key: "match",
    label: "Match Generation",
    caption: "Here's who we found.",
  },
] as const;
