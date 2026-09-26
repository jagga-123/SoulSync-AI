"use client";

import { motion } from "framer-motion";
import { Heart, Info, Loader2, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HeartMeter } from "@/components/ai/heart-meter";
import { ProfileMedia } from "@/components/shared/profile-media";
import { SafetyMenu } from "@/components/platform/safety-menu";
import { TIER_HEARTS, TIER_LABELS } from "@/lib/ai-format";
import { getInitials, sharedInterests } from "@/lib/format";
import type { AIMatchSummary, PublicProfile } from "@/types/api";

interface ProfileCardProps {
  profile: PublicProfile;
  liked: boolean;
  isLiking: boolean;
  onLike: () => void;
  /** AI compatibility with the viewer, when both have done the interview. */
  ai?: AIMatchSummary | null;
  /** Ranked for the viewer by the AI (the "AI Recommended" list) — shows the "Suggested for you" badge. */
  suggested?: boolean;
  /** The viewer's own interests, to show what the two of you have in common. */
  myInterests?: string[];
  /** Open the detail sheet (bio, every interest, the full "why", report/block). */
  onOpen: () => void;
  /** Phase 6: called after the viewer blocks this person from the card's safety menu. */
  onBlocked?: (userId: string) => void;
}

/**
 * The Discover card (docs/redesign/02 §6): a calm 4:5 photo with the name over a scrim, a label with hearts when
 * there is an AI read, "N in common" with the first two shared interests, and Like / More. The bio and the full
 * reasons live in the detail sheet, so cards stay quiet. Every badge shown here is one we can back up.
 */
export function ProfileCard({ profile, liked, isLiking, onLike, ai, suggested = false, myInterests = [], onOpen, onBlocked }: ProfileCardProps) {
  const initials = getInitials(profile.fullName);
  const firstName = profile.fullName.split(" ")[0] ?? profile.fullName;
  const common = sharedInterests(myInterests, profile.interests);
  const headingId = `card-${profile.id}`;

  return (
    <motion.article
      layout
      aria-labelledby={headingId}
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.25, ease: "easeIn" } }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-card transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40 active:scale-[0.99]">
        <div className="relative aspect-[4/5] w-full overflow-hidden">
          <div className="absolute inset-0 transition-transform duration-[400ms] group-hover:scale-[1.03]">
            <ProfileMedia
              src={profile.profileImage}
              initials={initials}
              gradient="from-accent to-primary"
              noPhotoNote
              className="absolute inset-0 size-full rounded-none text-5xl"
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-background/95 via-background/45 to-transparent" />

          {/* The whole photo is the way in to the detail sheet. */}
          <button
            type="button"
            onClick={onOpen}
            aria-label={`More about ${profile.fullName}, ${profile.age}`}
            className="absolute inset-0 z-[1] outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring/70"
          />

          {suggested && (
            <span
              title="Suggested using your conversation with Sol."
              className="pointer-events-none absolute left-2.5 top-2.5 z-[2] rounded-full border border-primary/60 bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur"
            >
              <span aria-hidden className="mr-1 text-primary">✦</span>
              <span className="sm:hidden">Suggested</span>
              <span className="hidden sm:inline">Suggested for you</span>
            </span>
          )}
          <SafetyMenu userId={profile.id} userName={profile.fullName} onBlocked={onBlocked} align="right" className="absolute right-2 top-2 z-10" />

          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[2]">
            <h3 id={headingId} title={profile.fullName} className="truncate font-display text-lg font-semibold text-white sm:text-xl">
              {profile.fullName}
              <span className="font-sans font-normal">, {profile.age}</span>
            </h3>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-white/80">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{profile.city}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 p-3 sm:p-4">
          {ai && (
            <div className="flex items-start gap-1.5 text-xs font-medium text-white">
              <HeartMeter hearts={TIER_HEARTS[ai.tier]} label={TIER_LABELS[ai.tier]} decorative heartClassName="size-3" className="mt-0.5 shrink-0" />
              <span className="min-w-0">{TIER_LABELS[ai.tier]}</span>
            </div>
          )}

          {common.length > 0 && (
            <div>
              <p className="text-xs font-medium text-accent">{common.length} in common</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {common.slice(0, 2).map((interest) => (
                  <li key={interest} className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-xs text-accent">
                    {interest}
                  </li>
                ))}
                {common.length > 2 && (
                  <li className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">+{common.length - 2}</li>
                )}
              </ul>
            </div>
          )}

          <div className="mt-auto flex items-center gap-2 pt-1">
            <Button
              onClick={onLike}
              disabled={liked || isLiking}
              aria-label={liked ? `Liked ${firstName}` : `Like ${firstName}`}
              className={
                liked
                  ? "h-11 flex-1 gap-2 rounded-full bg-white/10 text-white/80"
                  : "h-11 flex-1 gap-2 rounded-full bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
              }
            >
              {isLiking ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <motion.span animate={liked ? { scale: [1, 1.35, 1] } : {}} transition={{ duration: 0.4 }} className="inline-flex">
                  <Heart className={liked ? "size-4 fill-accent text-accent" : "size-4"} aria-hidden />
                </motion.span>
              )}
              {liked ? "Liked" : "Like"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onOpen}
              aria-label={`More about ${firstName}`}
              title={`More about ${firstName}`}
              className="size-11 shrink-0 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]"
            >
              <Info className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
