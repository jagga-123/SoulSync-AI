"use client";

import { motion } from "framer-motion";
import { Check, Loader2, MapPin, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProfileMedia } from "@/components/shared/profile-media";
import { getInitials, RELATIONSHIP_GOAL_LABELS } from "@/lib/format";
import type { LikeEntry, LikeStatus } from "@/types/api";

interface LikeCardProps {
  entry: LikeEntry;
  mode: "incoming" | "outgoing";
  onAccept?: () => void;
  onReject?: () => void;
  isProcessing?: boolean;
}

const STATUS_STYLES: Record<LikeStatus, string> = {
  pending: "border-white/15 text-white/70",
  accepted: "border-accent/40 text-accent",
  rejected: "border-destructive/40 text-destructive",
};

const STATUS_LABELS: Record<LikeStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Not accepted",
};

export function LikeCard({ entry, mode, onAccept, onReject, isProcessing }: LikeCardProps) {
  const { user } = entry;
  const initials = getInitials(user.fullName);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.25 } }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="glass flex items-center gap-4 rounded-2xl p-4 sm:p-5"
    >
      <ProfileMedia
        src={user.profileImage}
        initials={initials}
        thumb
        className="size-16 shrink-0 rounded-2xl text-lg"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-semibold text-white">
          {user.fullName}, {user.age}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-white/50">
          <MapPin className="size-3" />
          {user.city}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="border-white/15 text-white/60">
            {RELATIONSHIP_GOAL_LABELS[user.relationshipGoal] ?? user.relationshipGoal}
          </Badge>
          {mode === "outgoing" && (
            <Badge variant="outline" className={STATUS_STYLES[entry.status]}>
              {STATUS_LABELS[entry.status]}
            </Badge>
          )}
        </div>
      </div>

      {mode === "incoming" && (
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button
            size="icon"
            onClick={onAccept}
            disabled={isProcessing}
            aria-label="Accept like"
            className="size-11 rounded-full bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
          >
            {isProcessing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={onReject}
            disabled={isProcessing}
            aria-label="Reject like"
            className="size-11 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
    </motion.div>
  );
}
