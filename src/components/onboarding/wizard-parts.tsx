"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Coffee, Compass, Heart, Plus, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { HEART_PATH } from "@/components/brand/heart-path";
import { ProfileMedia } from "@/components/shared/profile-media";
import { RELATIONSHIP_GOAL_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GENDER_OPTIONS, RELATIONSHIP_GOAL_OPTIONS } from "@/types/api";

/* ---------------------------------------------------------------- progress */

/** One small heart per step, filled as you go — the same language as the interview. Spoken as "Step 2 of 5". */
export function StepHearts({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div aria-hidden className="flex items-center gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <svg key={i} viewBox="0 0 48 44" className="h-4 w-[18px]">
            <path d={HEART_PATH} fill={i < step ? "var(--primary)" : "none"} stroke="var(--foreground)" strokeOpacity={i < step ? 0 : 0.3} strokeWidth={3} strokeLinejoin="round" />
          </svg>
        ))}
      </div>
      <p role="status" aria-live="polite" className="text-xs font-medium text-white/70">
        Step {step} of {total}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- choices */

const GENDER_LABELS: Record<string, string> = { male: "Male", female: "Female", "non-binary": "Non-binary", other: "Other" };

/** A small set of options as big, tappable pills (a radio group, so arrow keys work). */
export function GenderPills({ value, onChange, error, describedBy }: { value: string; onChange: (v: string) => void; error?: boolean; describedBy?: string }) {
  return (
    <div role="radiogroup" aria-label="Gender" aria-invalid={error || undefined} aria-describedby={describedBy} className="flex flex-wrap gap-2">
      {GENDER_OPTIONS.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
            className={cn(
              "h-11 rounded-full border px-5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "border-primary bg-primary/15 text-white" : "border-white/15 bg-white/[0.03] text-white/80 hover:bg-white/[0.08]",
            )}
          >
            {GENDER_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}

const GOAL_COPY: Record<string, { icon: LucideIcon; description: string }> = {
  casual: { icon: Coffee, description: "Keep it light and see where it goes." },
  serious: { icon: Heart, description: "Looking for something lasting." },
  friendship: { icon: Users, description: "New people, no pressure." },
  "not-sure": { icon: Compass, description: "I'll know it when I see it." },
};

/** What you're looking for, as four big tappable cards instead of a dropdown. */
export function GoalCards({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label="What are you looking for?" className="grid gap-3 sm:grid-cols-2">
      {RELATIONSHIP_GOAL_OPTIONS.map((option) => {
        const selected = value === option;
        const copy = GOAL_COPY[option];
        const Icon = copy?.icon ?? Heart;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
            className={cn(
              "flex min-h-24 items-start gap-4 rounded-2xl border p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "border-primary bg-primary/10" : "border-white/12 bg-white/[0.03] hover:bg-white/[0.07]",
            )}
          >
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", selected ? "bg-gradient-brand text-white" : "bg-white/5 text-accent ring-1 ring-white/10")}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-display text-base font-semibold text-white">{RELATIONSHIP_GOAL_LABELS[option] ?? option}</span>
              <span className="mt-0.5 block text-sm text-white/70">{copy?.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- interests */

export const MAX_INTERESTS = 20;
const MAX_INTEREST_LENGTH = 40;
const SUGGESTED = ["Hiking", "Cooking", "Travel", "Reading", "Music", "Movies", "Photography", "Fitness", "Gaming", "Art", "Coffee", "Dancing", "Yoga", "Podcasts", "Gardening", "Cycling"];

const sameInterest = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Suggested interests to tap, plus your own (Enter or comma adds one). Duplicates ignored, at most 20. */
export function InterestPicker({ value, onChange, error, describedBy }: { value: string[]; onChange: (next: string[]) => void; error?: boolean; describedBy?: string }) {
  const [text, setText] = useState("");
  const inputId = useId();
  const has = (label: string) => value.some((v) => sameInterest(v, label));

  function add(raw: string) {
    const label = raw.trim().slice(0, MAX_INTEREST_LENGTH);
    if (!label || has(label) || value.length >= MAX_INTERESTS) return;
    onChange([...value, label]);
  }
  function toggle(label: string) {
    if (has(label)) onChange(value.filter((v) => !sameInterest(v, label)));
    else add(label);
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault(); // Enter here adds a tag; it doesn't submit the step
      add(text);
      setText("");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-white/85" id={`${inputId}-suggested`}>Tap what fits</p>
        <ul aria-labelledby={`${inputId}-suggested`} className="mt-2 flex flex-wrap gap-2">
          {SUGGESTED.map((label) => {
            const on = has(label);
            return (
              <li key={label}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(label)}
                  className={cn(
                    "h-9 rounded-full border px-4 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "border-accent/50 bg-accent/15 text-accent" : "border-white/12 bg-white/[0.03] text-white/80 hover:bg-white/[0.08]",
                  )}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <label htmlFor={inputId} className="text-sm font-medium text-white/85">Or add your own</label>
        <div className="mt-2 flex gap-2">
          <input
            id={inputId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_INTEREST_LENGTH}
            placeholder="e.g. pottery"
            aria-invalid={error || undefined}
            aria-describedby={describedBy}
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/[0.03] px-4 text-sm text-white outline-none placeholder:text-white/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <button
            type="button"
            onClick={() => {
              add(text);
              setText("");
            }}
            aria-label="Add interest"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] text-white outline-none transition-colors hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {value.length > 0 && (
        <div>
          <p className="text-sm font-medium text-white/85">
            Your interests <span className="font-normal text-white/60">· {value.length} of {MAX_INTERESTS}</span>
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {value.map((label) => (
              <li key={label} className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 py-1 pl-3 pr-1 text-sm text-accent">
                {label}
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={() => onChange(value.filter((v) => v !== label))}
                  className="flex size-7 items-center justify-center rounded-full outline-none hover:bg-accent/20 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- preview */

interface ProfilePreviewProps {
  name: string;
  age: string;
  city: string;
  goal: string;
  photo: string;
  initials: string;
  interests: string[];
}

/** How your card will look in Discover, live as you type. A compact row on phones, the full card from laptops up. */
export function ProfilePreview({ name, age, city, goal, photo, initials, interests }: ProfilePreviewProps) {
  const first = name.split(" ")[0] || "You";
  const title = age.trim() ? `${first}, ${age.trim()}` : first;
  const chips = (
    <ul className="flex flex-wrap gap-1.5">
      {interests.slice(0, 3).map((label) => (
        <li key={label} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">{label}</li>
      ))}
      {interests.length > 3 && <li className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">+{interests.length - 3}</li>}
    </ul>
  );

  return (
    <aside aria-label="Preview of your profile card">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/60">How others will see you</p>

      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-card p-3 lg:hidden">
        <ProfileMedia src={photo || undefined} initials={initials} gradient="from-accent to-primary" thumb className="size-16 shrink-0 rounded-2xl text-xl" />
        <div className="min-w-0 space-y-1.5">
          <p className="truncate font-display text-base font-semibold text-white">{title}</p>
          <p className="truncate text-xs text-white/70">{[city.trim(), RELATIONSHIP_GOAL_LABELS[goal]].filter(Boolean).join(" · ") || "Your city · what you're looking for"}</p>
          {chips}
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-3xl border border-white/10 bg-card lg:block">
        <div className="relative aspect-[4/5] w-full">
          <ProfileMedia src={photo || undefined} initials={initials} gradient="from-accent to-primary" noPhotoNote className="absolute inset-0 size-full rounded-none text-5xl" />
          <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-background/95 via-background/45 to-transparent" />
          <div className="absolute inset-x-3 bottom-3">
            <p className="truncate font-display text-xl font-semibold text-white">{title}</p>
            <p className="mt-0.5 truncate text-xs text-white/80">{city.trim() || "Your city"}</p>
          </div>
        </div>
        <div className="space-y-2.5 p-4">
          <p className="text-xs font-medium text-accent">{RELATIONSHIP_GOAL_LABELS[goal] ?? "What you're looking for"}</p>
          {chips}
        </div>
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------- prompts */

export const BIO_PROMPTS = ["The way to my heart is…", "A perfect Sunday is…", "I'm looking for someone who…"];
