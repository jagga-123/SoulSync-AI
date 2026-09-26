"use client";

import { useEffect, useRef } from "react";
import { Dialog } from "radix-ui";
import { Heart, Loader2, MapPin, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AIMatchPill } from "@/components/ai/ai-match-pill";
import { WhyPanel } from "@/components/ai/why-panel";
import { ProfileMedia } from "@/components/shared/profile-media";
import { SafetyMenu } from "@/components/platform/safety-menu";
import { useAICompatibility } from "@/hooks/use-ai-compatibility";
import { recordProfileView } from "@/lib/api/platform";
import { getInitials, RELATIONSHIP_GOAL_LABELS, sharedInterests } from "@/lib/format";
import type { AIMatchSummary, PublicProfile } from "@/types/api";

interface ProfileSheetProps {
  profile: PublicProfile;
  ai?: AIMatchSummary | null;
  suggested?: boolean;
  myInterests?: string[];
  liked: boolean;
  isLiking: boolean;
  onLike: () => void;
  onClose: () => void;
  onBlocked?: (userId: string) => void;
}

/**
 * The detail sheet (docs/redesign/02 §6.1): everything a card leaves out — the bio, every interest (the shared ones
 * lit), the full "why you two match", and Report / Block. A bottom sheet with a focus trap; Escape or the close button
 * closes it. Opening it counts as viewing the profile, exactly as expanding a match does.
 */
export function ProfileSheet({ profile, ai, suggested = false, myInterests = [], liked, isLiking, onLike, onClose, onBlocked }: ProfileSheetProps) {
  const firstName = profile.fullName.split(" ")[0] ?? profile.fullName;
  const common = sharedInterests(myInterests, profile.interests);
  const commonSet = new Set(common.map((i) => i.trim().toLowerCase()));
  const { state, retry } = useAICompatibility(profile.id, true);
  // The sheet isn't opened from a Dialog.Trigger, so remember what had focus and give it back on close.
  const openerRef = useRef<Element | null>(typeof document !== "undefined" ? document.activeElement : null);

  useEffect(() => {
    void recordProfileView(profile.id).catch(() => {});
  }, [profile.id]);

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[89] bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (openerRef.current as HTMLElement | null)?.focus?.();
          }}
          className="fixed inset-x-0 bottom-0 z-[90] mx-auto flex max-h-[92svh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-background shadow-2xl shadow-black/60 outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300"
        >
          <div className="relative aspect-[4/3] max-h-[38svh] w-full shrink-0">
            <ProfileMedia
              src={profile.profileImage}
              initials={getInitials(profile.fullName)}
              gradient="from-accent to-primary"
              noPhotoNote
              className="absolute inset-0 size-full rounded-none text-6xl"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background to-transparent" />
            <SafetyMenu userId={profile.id} userName={profile.fullName} onBlocked={onBlocked} align="left" className="absolute left-3 top-3 z-10" />
            <Dialog.Close
              aria-label="Close"
              className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-black/50 text-white outline-none backdrop-blur transition-colors hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-3">
            <div>
              <Dialog.Title className="font-display text-2xl font-semibold text-white">
                {profile.fullName}
                <span className="font-sans font-normal">, {profile.age}</span>
              </Dialog.Title>
              <p className="mt-1 flex items-center gap-1 text-sm text-white/70">
                <MapPin className="size-3.5" aria-hidden />
                {profile.city}
                <span aria-hidden> · </span>
                {RELATIONSHIP_GOAL_LABELS[profile.relationshipGoal] ?? profile.relationshipGoal}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {ai && <AIMatchPill score={ai.score} tier={ai.tier} />}
                {suggested && (
                  <span className="rounded-full border border-primary/60 bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span aria-hidden className="mr-1 text-primary">✦</span>
                    Suggested for you
                  </span>
                )}
              </div>
            </div>

            {profile.bio && <p className="text-pretty text-sm leading-relaxed text-white/80">{profile.bio}</p>}

            {profile.interests.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-white/60">
                  Interests{common.length > 0 && <span className="normal-case tracking-normal text-accent"> · {common.length} in common</span>}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {profile.interests.map((interest) => (
                    <li
                      key={interest}
                      className={
                        commonSet.has(interest.trim().toLowerCase())
                          ? "rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs text-accent"
                          : "rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70"
                      }
                    >
                      {interest}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <WhyPanel state={state} firstName={firstName} onRetry={retry} flush />
          </div>

          <div className="shrink-0 border-t border-white/10 bg-background px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
            <Button
              onClick={onLike}
              disabled={liked || isLiking}
              className={
                liked
                  ? "h-12 w-full gap-2 rounded-full bg-white/10 text-base text-white/80"
                  : "h-12 w-full gap-2 rounded-full bg-gradient-brand text-base font-semibold text-white shadow-lg shadow-primary/25 hover:opacity-90"
              }
            >
              {isLiking ? <Loader2 className="size-4 animate-spin" /> : <Heart className={liked ? "size-4 fill-accent text-accent" : "size-4"} aria-hidden />}
              {liked ? `Liked ${firstName}` : `Like ${firstName}`}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
