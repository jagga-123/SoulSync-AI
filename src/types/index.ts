import type { LucideIcon } from "lucide-react";

export interface NavLink {
  label: string;
  href: string;
}

/** A plain, provable statement about the product (never a metric we can't back up). */
export interface TrustFact {
  title: string;
  description: string;
  icon: LucideIcon;
}

/** One of the six things the compatibility engine compares, with the weight it really carries. */
export interface MatchArea {
  label: string;
  /** Share of the overall read, in percent. Mirrors COMPATIBILITY_WEIGHTS in backend/src/ai/compatibility.ts. */
  weight: number;
  description: string;
}

export interface ProcessStep {
  index: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface Feature {
  title: string;
  description: string;
  icon: LucideIcon;
}

/** A real, consented quote from a member. The section stays hidden until there are enough of them. */
export interface FoundingNote {
  quote: string;
  /** First name only. */
  name: string;
  city?: string;
}

/** One line of the landing page's plain-English "how our AI works" section. */
export interface AiPoint {
  title: string;
  body: string;
  icon: LucideIcon;
}

export interface FaqItem {
  q: string;
  a: string;
}
