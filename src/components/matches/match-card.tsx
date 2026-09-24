"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { ChevronDown, Heart, Loader2, MapPin, MessageCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AIMatchPill } from "@/components/ai/ai-match-pill";
import { MatchAIInsights } from "@/components/ai/match-ai-insights";
import { ProfileMedia } from "@/components/shared/profile-media";
import { SafetyMenu } from "@/components/platform/safety-menu";
import { recordProfileView } from "@/lib/api/platform";
import { useAICompatibility } from "@/hooks/use-ai-compatibility";
import { TIER_SUBLINES } from "@/lib/ai-format";
import { getInitials, RELATIONSHIP_GOAL_LABELS } from "@/lib/format";
import { startConversation } from "@/lib/api/conversations";
import { ApiClientError } from "@/lib/api-client";
import type { MatchEntry } from "@/types/api";

export function MatchCard({ match, onBlocked }: { match: MatchEntry; onBlocked?: (userId: string) => void }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const { user } = match;
  const initials = getInitials(user.fullName);

  // AI compatibility is fetched only once the card scrolls into view, so a
  // long matches list doesn't fire one request per card up front.
  const cardRef = useRef<HTMLDivElement>(null);
  const inView = useInView(cardRef, { once: true, amount: 0.2 });
  const { state: aiState, retry: retryAI } = useAICompatibility(user.id, inView);

  async function handleStartConversation() {
    setIsStartingChat(true);
    setChatError(null);
    try {
      const { conversation } = await startConversation(match.matchId);
      router.push(`/messages/${conversation.id}`);
    } catch (err) {
      setChatError(
        err instanceof ApiClientError ? err.message : "Couldn't start the conversation.",
      );
      setIsStartingChat(false);
    }
  }

  return (
    <motion.div
      ref={cardRef}
      layout
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass-strong relative flex flex-col overflow-hidden rounded-3xl"
    >
      <SafetyMenu userId={user.id} userName={user.fullName} onBlocked={onBlocked} className="absolute right-3 top-3 z-10" />
      <div className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
        <ProfileMedia
          src={user.profileImage}
          initials={initials}
          className="size-24 shrink-0 rounded-2xl text-2xl"
        />

        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold text-white">
            {user.fullName}, {user.age}
          </p>
          <p className="mt-1 flex items-center justify-center gap-1 text-sm text-white/55 sm:justify-start">
            <MapPin className="size-3.5" />
            {user.city}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-white/60">
            {RELATIONSHIP_GOAL_LABELS[user.relationshipGoal] ?? user.relationshipGoal}
          </p>
        </div>

        {/* The label and a line about what it means come first; the percentage lives in the tooltip. */}
        {aiState.status === "ready" ? (
          <div className="flex shrink-0 flex-col items-center gap-1.5 sm:max-w-[13rem] sm:items-end sm:text-right">
            <AIMatchPill score={aiState.data.score} tier={aiState.data.tier} />
            <p className="text-xs leading-snug text-white/70">{TIER_SUBLINES[aiState.data.tier]}</p>
          </div>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-background/80 px-3 py-1 text-xs font-semibold text-white">
            <Heart className="size-3.5 fill-primary text-primary" aria-hidden />
            It&apos;s a match
          </span>
        )}
      </div>

      <MatchAIInsights state={aiState} firstName={user.fullName.split(" ")[0] ?? user.fullName} onRetry={retryAI} />

      <div className="px-6 pb-6">
        {chatError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{chatError}</AlertDescription>
          </Alert>
        )}
        <Button
          onClick={handleStartConversation}
          disabled={isStartingChat}
          className="w-full gap-2 rounded-full bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
        >
          {isStartingChat ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MessageCircle className="size-4" />
          )}
          {isStartingChat ? "Opening chat..." : "Start Conversation"}
        </Button>
      </div>

      {match.sharedInterests.length > 0 && (
        <div className="border-t border-white/10 px-6 py-4">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-white/60">
            <Sparkles className="size-3.5 text-accent" />
            Shared interests
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {match.sharedInterests.map((interest) => (
              <span
                key={interest}
                className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs text-accent"
              >
                {interest}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          // Phase 6: opening someone's full profile counts as a (rate-limited, anonymous) profile view.
          if (!expanded) void recordProfileView(user.id).catch(() => {});
          setExpanded((v) => !v);
        }}
        className="flex items-center justify-center gap-1.5 border-t border-white/10 px-6 py-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
      >
        {expanded ? "Hide profile" : "View profile"}
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.25 }}>
          <ChevronDown className="size-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-6 pb-6 pt-1">
              {user.bio && <p className="text-sm leading-relaxed text-white/60">{user.bio}</p>}
              {user.interests.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-white/60">
                    All interests
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {user.interests.map((interest) => (
                      <span
                        key={interest}
                        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
