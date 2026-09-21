import type { LucideIcon } from "lucide-react";

export interface NavLink {
  label: string;
  href: string;
}

export interface PersonalityTrait {
  label: string;
  value: number;
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

export interface Testimonial {
  name: string;
  location: string;
  quote: string;
  rating: number;
  initials: string;
}

export interface TrustStat {
  value: number;
  suffix: string;
  decimals?: number;
  label: string;
}

export interface ProfileCard {
  name: string;
  age: number;
  role: string;
  match: number;
  initials: string;
  gradient: string;
}
