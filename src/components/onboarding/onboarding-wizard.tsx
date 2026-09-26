"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/auth/form-field";
import { PhotoUploader } from "@/components/profile/photo-uploader";
import { BIO_PROMPTS, GenderPills, GoalCards, InterestPicker, ProfilePreview, StepHearts } from "@/components/onboarding/wizard-parts";
import { createProfile } from "@/lib/api/profile";
import { ApiClientError } from "@/lib/api-client";
import { getInitials } from "@/lib/format";
import { profileFormSchema } from "@/lib/validators/profile";
import { fieldErrorsFromApi, fieldErrorsFromZod } from "@/lib/zod-errors";

// Only the last screen draws a heart, so it loads on demand.
const HeartPulse = dynamic(() => import("@/components/brand/heart-pulse").then((m) => m.HeartPulse));

const TOTAL_STEPS = 5;
const MAX_BIO = 500;

/** Which step each field lives on, so a server-side complaint can take you back to the right screen. */
const STEP_OF_FIELD: Record<string, number> = { age: 1, gender: 1, city: 1, relationshipGoal: 2, profileImage: 3, bio: 4, interests: 4 };

interface Draft {
  step: number;
  age: string;
  gender: string;
  city: string;
  goal: string;
  photo: string;
  bio: string;
  interests: string[];
}

const EMPTY_DRAFT: Draft = { step: 0, age: "", gender: "", city: "", goal: "", photo: "", bio: "", interests: [] };

// The draft lives in this browser only, per account, and only until the profile is created.
const draftKey = (userId: string) => `soulsync:onboarding:${userId}`;

function loadDraft(userId: string): Draft {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return EMPTY_DRAFT;
    const d = JSON.parse(raw) as Partial<Draft>;
    return {
      step: Number.isInteger(d.step) && d.step! >= 0 && d.step! < TOTAL_STEPS ? d.step! : 0,
      age: typeof d.age === "string" ? d.age : "",
      gender: typeof d.gender === "string" ? d.gender : "",
      city: typeof d.city === "string" ? d.city : "",
      goal: typeof d.goal === "string" ? d.goal : "",
      photo: typeof d.photo === "string" ? d.photo : "",
      bio: typeof d.bio === "string" ? d.bio.slice(0, MAX_BIO) : "",
      interests: Array.isArray(d.interests) ? d.interests.filter((i): i is string => typeof i === "string").slice(0, 20) : [],
    };
  } catch {
    return EMPTY_DRAFT; // storage unavailable or corrupt — start fresh
  }
}

function saveDraft(userId: string, draft: Draft) {
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify(draft));
  } catch {
    /* private mode — the wizard still works, it just won't remember */
  }
}

function clearDraft(userId: string) {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    /* nothing to clear */
  }
}

interface OnboardingWizardProps {
  userId: string;
  fullName: string;
}

/**
 * The first-run profile setup (docs/redesign/03 §10): five short screens, one idea each, hearts for progress. It saves
 * as you go (in this browser), Back is always there, Enter moves on, and focus follows the heading. The profile is
 * created with the same request the old form used, at the end.
 */
export function OnboardingWizard({ userId, fullName }: OnboardingWizardProps) {
  const router = useRouter();
  const firstName = fullName.split(" ")[0] || "there";
  const initials = getInitials(fullName);

  const [draft, setDraft] = useState<Draft>(() => loadDraft(userId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);
  const firstRender = useRef(true);
  const { step } = draft;

  const patch = (changes: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...changes }));
    const touched = Object.keys(changes).map((k) => (k === "goal" ? "relationshipGoal" : k === "photo" ? "profileImage" : k));
    setErrors((prev) => (touched.some((k) => k in prev) ? Object.fromEntries(Object.entries(prev).filter(([k]) => !touched.includes(k))) : prev));
  };

  // Remember progress as it changes.
  useEffect(() => {
    if (!done) saveDraft(userId, draft);
  }, [draft, done, userId]);

  // Move keyboard focus to the new step's heading (not on first load, which would steal it from the page).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [step, done]);

  function goTo(next: number) {
    setErrors({});
    setFormError(null);
    patch({ step: Math.max(0, Math.min(TOTAL_STEPS - 1, next)) });
  }

  function validateStep(): boolean {
    if (step === 1) {
      const result = profileFormSchema.pick({ age: true, gender: true, city: true }).safeParse({ age: draft.age, gender: draft.gender || undefined, city: draft.city });
      if (!result.success) {
        setErrors(fieldErrorsFromZod(result.error));
        return false;
      }
    }
    if (step === 2 && !draft.goal) {
      setErrors({ relationshipGoal: "Pick the one that fits best — you can change it later." });
      return false;
    }
    if (step === 4) {
      const next: Record<string, string> = {};
      if (draft.interests.length < 3) next.interests = "Pick at least 3 interests — they're how we find what you have in common.";
      if (draft.bio.length > MAX_BIO) next.bio = `Keep your bio to ${MAX_BIO} characters or fewer.`;
      if (Object.keys(next).length) {
        setErrors(next);
        return false;
      }
    }
    setErrors({});
    return true;
  }

  async function finish() {
    setFormError(null);
    const result = profileFormSchema.safeParse({
      age: draft.age,
      gender: draft.gender || undefined,
      city: draft.city,
      bio: draft.bio,
      interests: draft.interests,
      relationshipGoal: draft.goal || undefined,
      profileImage: draft.photo,
    });
    if (!result.success) {
      const found = fieldErrorsFromZod(result.error);
      setErrors(found);
      const earliest = Math.min(...Object.keys(found).map((k) => STEP_OF_FIELD[k] ?? 1));
      patch({ step: earliest });
      return;
    }

    setIsSubmitting(true);
    try {
      await createProfile({ ...result.data, profileImage: result.data.profileImage || undefined });
      clearDraft(userId);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
        if (err.status === 422) {
          const found = fieldErrorsFromApi(err.details);
          setErrors(found);
          const keys = Object.keys(found);
          if (keys.length) patch({ step: Math.min(...keys.map((k) => STEP_OF_FIELD[k] ?? 1)) });
        }
      } else {
        setFormError("Something went wrong. Your answers are still here — please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    if (!validateStep()) return;
    if (step === TOTAL_STEPS - 1) void finish();
    else goTo(step + 1);
  }

  function addPrompt(prompt: string) {
    const separator = draft.bio && !draft.bio.endsWith(" ") && !draft.bio.endsWith("\n") ? " " : "";
    const next = `${draft.bio}${separator}${prompt} `;
    if (next.length <= MAX_BIO) patch({ bio: next });
    bioRef.current?.focus();
  }

  const isLast = step === TOTAL_STEPS - 1;
  const headingClass = "font-display text-3xl font-semibold text-white outline-none sm:text-4xl";

  return (
    <div className="relative mx-auto max-w-4xl px-4 pb-20 pt-28 sm:px-6">
      {!done && <StepHearts step={step + 1} total={TOTAL_STEPS} />}

      {/* Each step fades in as it arrives (CSS only; instant under reduced motion). */}
      <div key={done ? "done" : step} className="mt-8 animate-in fade-in-0 slide-in-from-right-4 duration-300">
        <div>
          {done ? (
            <div className="mx-auto max-w-lg text-center">
              <HeartPulse loop={false} className="mx-auto size-16" />
              <h1 ref={headingRef} tabIndex={-1} className={`mt-6 ${headingClass}`}>
                You&apos;re in.
              </h1>
              <p className="mx-auto mt-4 max-w-md text-pretty text-white/75">
                Next, meet Sol — a 10-minute conversation that helps us find people who click with you.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3">
                <Button asChild size="lg" className="h-12 gap-2 rounded-full bg-gradient-brand px-8 text-base font-semibold text-white shadow-lg shadow-primary/25 hover:opacity-90">
                  <Link href="/ai-interview">
                    Meet Sol
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
                <Link href="/dashboard" className="rounded-md px-3 py-2 text-sm font-medium text-white/75 underline-offset-2 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                  Explore first
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className={`mx-auto ${step === TOTAL_STEPS - 1 ? "max-w-4xl" : "max-w-xl"}`}>
              {formError && (
                <Alert variant="destructive" className="mb-6">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              {step === 0 && (
                <div className="text-center">
                  <h1 ref={headingRef} tabIndex={-1} className={headingClass}>
                    Welcome, {firstName}.
                  </h1>
                  <p className="mx-auto mt-4 max-w-md text-pretty text-lg text-white/75">Let&apos;s set up your profile. It takes about 3 minutes.</p>
                  <p className="mt-2 text-sm text-white/60">SoulSync is for people 18 and over.</p>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <h1 ref={headingRef} tabIndex={-1} className={headingClass}>The basics</h1>
                    <p className="mt-2 text-white/70">We show your age and city to other members.</p>
                  </div>
                  <FormField label="Age" htmlFor="wiz-age" error={errors.age} hint="You must be 18 or older.">
                    <Input id="wiz-age" type="number" inputMode="numeric" min={18} max={120} value={draft.age} onChange={(e) => patch({ age: e.target.value })} placeholder="27" aria-invalid={Boolean(errors.age) || undefined} />
                  </FormField>
                  <div className="space-y-1.5">
                    <p id="wiz-gender-label" className="text-sm font-medium text-white/85">Gender</p>
                    <GenderPills value={draft.gender} onChange={(gender) => patch({ gender })} error={Boolean(errors.gender)} describedBy={errors.gender ? "wiz-gender-error" : undefined} />
                    {errors.gender && <p id="wiz-gender-error" className="text-xs text-destructive">{errors.gender}</p>}
                  </div>
                  <FormField label="City" htmlFor="wiz-city" error={errors.city}>
                    <Input id="wiz-city" autoComplete="address-level2" value={draft.city} onChange={(e) => patch({ city: e.target.value })} placeholder="Bengaluru" aria-invalid={Boolean(errors.city) || undefined} />
                  </FormField>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <h1 ref={headingRef} tabIndex={-1} className={headingClass}>What are you looking for?</h1>
                    <p className="mt-2 text-white/70">Be honest — it&apos;s the first thing we match on. You can change it any time.</p>
                  </div>
                  <GoalCards value={draft.goal} onChange={(goal) => patch({ goal })} />
                  {errors.relationshipGoal && <p role="alert" className="text-sm text-destructive">{errors.relationshipGoal}</p>}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div>
                    <h1 ref={headingRef} tabIndex={-1} className={headingClass}>A photo</h1>
                    <p className="mt-2 text-white/70">Clear, recent, just you.</p>
                  </div>
                  <PhotoUploader
                    value={draft.photo}
                    onChange={(photo) => patch({ photo })}
                    initials={initials}
                    linkField={
                      <FormField label="Photo link" htmlFor="wiz-photo-url" error={errors.profileImage} hint="Paste a link to a photo">
                        <Input id="wiz-photo-url" value={draft.photo} onChange={(e) => patch({ photo: e.target.value })} placeholder="https://..." />
                      </FormField>
                    }
                  />
                  <p className="text-sm text-white/60">No photo yet is fine — you can add one any time from your profile.</p>
                </div>
              )}

              {step === 4 && (
                <div className="flex flex-col gap-8 lg:grid lg:max-w-4xl lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-10">
                  <div className="order-2 space-y-8 lg:order-1">
                    <div>
                      <h1 ref={headingRef} tabIndex={-1} className={headingClass}>A little about you</h1>
                      <p className="mt-2 text-white/70">Two things people look at first.</p>
                    </div>

                    <div className="space-y-2">
                      <FormField label="Bio" htmlFor="wiz-bio" error={errors.bio} hint={`Optional · ${draft.bio.length}/${MAX_BIO}`}>
                        <Textarea id="wiz-bio" ref={bioRef} rows={4} maxLength={MAX_BIO} value={draft.bio} onChange={(e) => patch({ bio: e.target.value })} placeholder="Tell people what makes a great conversation with you..." />
                      </FormField>
                      <ul aria-label="Need a start? Tap one" className="flex flex-wrap gap-2">
                        {BIO_PROMPTS.map((prompt) => (
                          <li key={prompt}>
                            <button
                              type="button"
                              onClick={() => addPrompt(prompt)}
                              className="min-h-9 rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-left text-sm text-white/80 outline-none transition-colors hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {prompt}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h2 className="mb-3 font-display text-xl font-semibold text-white">Interests</h2>
                      <InterestPicker value={draft.interests} onChange={(interests) => patch({ interests })} error={Boolean(errors.interests)} describedBy={errors.interests ? "wiz-interests-error" : undefined} />
                      <p id="wiz-interests-error" role={errors.interests ? "alert" : undefined} className={errors.interests ? "mt-3 text-sm text-destructive" : "mt-3 text-sm text-white/60"}>
                        {errors.interests ?? (draft.interests.length < 3 ? `Pick at least 3 — ${3 - draft.interests.length} to go.` : "Nice — that's plenty to start with.")}
                      </p>
                    </div>
                  </div>

                  <div className="order-1 lg:order-2 lg:sticky lg:top-28 lg:self-start">
                    <ProfilePreview name={fullName} age={draft.age} city={draft.city} goal={draft.goal} photo={draft.photo} initials={initials} interests={draft.interests} />
                  </div>
                </div>
              )}

              <div className="mt-10 flex items-center justify-between gap-3">
                {step > 0 ? (
                  <Button type="button" variant="ghost" onClick={() => goTo(step - 1)} disabled={isSubmitting} className="h-11 gap-2 rounded-full px-5 text-white/80 hover:bg-white/10 hover:text-white">
                    <ArrowLeft className="size-4" aria-hidden />
                    Back
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-3">
                  {step === 3 && !draft.photo && (
                    <Button type="button" variant="ghost" onClick={() => goTo(4)} className="h-11 rounded-full px-5 text-white/80 hover:bg-white/10 hover:text-white">
                      Skip for now
                    </Button>
                  )}
                  <Button type="submit" disabled={isSubmitting} className="h-11 gap-2 rounded-full bg-gradient-brand px-7 text-base font-semibold text-white shadow-lg shadow-primary/25 hover:opacity-90">
                    {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    {step === 0 ? "Get started" : isLast ? (isSubmitting ? "Saving…" : "Finish") : "Continue"}
                    {!isSubmitting && !isLast && <ArrowRight className="size-4" aria-hidden />}
                  </Button>
                </div>
              </div>

              {step > 0 && (
                <p className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard")}
                    className="rounded-md px-2 py-1.5 text-sm text-white/70 underline-offset-2 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Save and finish later
                  </button>
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
