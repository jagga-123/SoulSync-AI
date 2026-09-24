"use client";

import { motion } from "framer-motion";
import { Heart, Loader2, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TiltCard } from "@/components/effects/tilt-card";
import { AIMatchPill, AIReasons } from "@/components/ai/ai-match-pill";
import { ProfileMedia } from "@/components/shared/profile-media";
import { SafetyMenu } from "@/components/platform/safety-menu";
import { getInitials, RELATIONSHIP_GOAL_LABELS } from "@/lib/format";
import type { AIMatchSummary, PublicProfile } from "@/types/api";

interface ProfileCardProps {
  profile: PublicProfile;
  liked: boolean;
  isLiking: boolean;
  onLike: () => void;
  /** AI compatibility with the viewer, when both have done the interview. */
  ai?: AIMatchSummary | null;
  /** The viewer has an AI profile but this person doesn't yet. */
  aiPending?: boolean;
  /** Phase 6: called after the viewer blocks this person from the card's safety menu. */
  onBlocked?: (userId: string) => void;
}

export function ProfileCard({ profile, liked, isLiking, onLike, ai, aiPending, onBlocked }: ProfileCardProps) {
  const initials = getInitials(profile.fullName);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.25, ease: "easeIn" } }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      <TiltCard className="h-full rounded-3xl" maxTilt={6}>
        <div className="glass flex h-full flex-col overflow-hidden rounded-3xl">
          <div className="relative aspect-[4/5] w-full">
            <ProfileMedia
              src={profile.profileImage}
              initials={initials}
              className="absolute inset-0 size-full rounded-none text-4xl"
            />
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background/95 to-transparent" />
            {ai && <AIMatchPill score={ai.score} tier={ai.tier} className="absolute right-3 top-3" />}
            <SafetyMenu userId={profile.id} userName={profile.fullName} onBlocked={onBlocked} align="left" className="absolute left-3 top-3 z-10" />
            <div className="absolute inset-x-4 bottom-3">
              <p className="font-display text-xl font-semibold text-white">
                {profile.fullName}, {profile.age}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-white/70">
                <MapPin className="size-3" />
                {profile.city}
              </p>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 p-5">
            <Badge variant="outline" className="w-fit border-white/15 text-white/70">
              {RELATIONSHIP_GOAL_LABELS[profile.relationshipGoal] ?? profile.relationshipGoal}
            </Badge>

            {profile.bio && <p className="line-clamp-2 text-sm text-white/55">{profile.bio}</p>}

            {profile.interests.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {profile.interests.slice(0, 4).map((interest) => (
                  <span
                    key={interest}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60"
                  >
                    {interest}
                  </span>
                ))}
                {profile.interests.length > 4 && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60">
                    +{profile.interests.length - 4}
                  </span>
                )}
              </div>
            )}

            {ai && ai.reasons.length > 0 && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <AIReasons reasons={ai.reasons} />
              </div>
            )}
            {!ai && aiPending && (
              <p className="text-xs text-white/60">You’ll see why you two match once they finish their interview.</p>
            )}

            <Button
              onClick={onLike}
              disabled={liked || isLiking}
              className={
                liked
                  ? "mt-auto gap-2 rounded-full bg-white/10 text-white/80"
                  : "mt-auto gap-2 rounded-full bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
              }
            >
              {isLiking ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <motion.span
                  animate={liked ? { scale: [1, 1.35, 1] } : {}}
                  transition={{ duration: 0.4 }}
                  className="inline-flex"
                >
                  <Heart className={liked ? "size-4 fill-accent text-accent" : "size-4"} />
                </motion.span>
              )}
              {liked ? "Liked" : "Like"}
            </Button>
          </div>
        </div>
      </TiltCard>
    </motion.div>
  );
}
