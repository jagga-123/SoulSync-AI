"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Inbox, Loader2, Send, Sparkles } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { LikeCard } from "@/components/likes/like-card";
import { EmptyState } from "@/components/shared/empty-state";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { acceptLike, getIncomingLikes, getOutgoingLikes, rejectLike } from "@/lib/api/likes";
import { ApiClientError } from "@/lib/api-client";
import type { LikeEntry, MatchEntry } from "@/types/api";

type Tab = "incoming" | "outgoing";

export function LikesView() {
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [tab, setTab] = useState<Tab>("incoming");
  const [incoming, setIncoming] = useState<LikeEntry[]>([]);
  const [outgoing, setOutgoing] = useState<LikeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [justMatched, setJustMatched] = useState<MatchEntry | null>(null);

  const loadLikes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [incomingRes, outgoingRes] = await Promise.all([
        getIncomingLikes(),
        getOutgoingLikes(),
      ]);
      setIncoming(incomingRes.likes);
      setOutgoing(outgoingRes.likes);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't load your likes.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadLikes();
  }, [user, loadLikes]);

  async function handleAccept(likeId: string) {
    setProcessingId(likeId);
    setError(null);
    try {
      const { match } = await acceptLike(likeId);
      setIncoming((prev) => prev.filter((entry) => entry.likeId !== likeId));
      setJustMatched(match);
      setTimeout(() => setJustMatched(null), 4000);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't accept that like.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(likeId: string) {
    setProcessingId(likeId);
    setError(null);
    try {
      await rejectLike(likeId);
      setIncoming((prev) => prev.filter((entry) => entry.likeId !== likeId));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't reject that like.");
    } finally {
      setProcessingId(null);
    }
  }

  if (isAuthLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-white/50" />
      </div>
    );
  }

  const items = tab === "incoming" ? incoming : outgoing;

  return (
    <div className="relative mx-auto max-w-3xl px-4 py-28 sm:px-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold text-white sm:text-4xl">Likes</h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-white/55">
          See who&apos;s interested, and keep track of who you&apos;ve liked.
        </p>
      </div>

      <AnimatePresence>
        {justMatched && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            className="glass-strong glow-primary mx-auto mt-6 flex max-w-md items-center gap-3 rounded-2xl p-4"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-brand">
              <Sparkles className="size-4 text-white" />
            </span>
            <p className="text-sm text-white">
              It&apos;s a match with{" "}
              <span className="font-semibold">{justMatched.user.fullName}</span> — say hello!
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="glass mx-auto mt-8 flex max-w-xs rounded-full p-1">
        <button
          type="button"
          onClick={() => setTab("incoming")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            tab === "incoming" ? "bg-gradient-brand text-white" : "text-white/60 hover:text-white"
          }`}
        >
          <Inbox className="size-3.5" />
          Incoming
          {incoming.length > 0 && (
            <span className="rounded-full bg-white/15 px-1.5 text-xs">{incoming.length}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("outgoing")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            tab === "outgoing" ? "bg-gradient-brand text-white" : "text-white/60 hover:text-white"
          }`}
        >
          <Send className="size-3.5" />
          Outgoing
        </button>
      </div>

      {error && (
        <Alert variant="destructive" className="mx-auto mt-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-8 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 animate-spin text-white/60" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Heart}
            title={tab === "incoming" ? "No likes yet" : "You haven't liked anyone yet"}
            description={
              tab === "incoming"
                ? "When someone likes your profile, they'll show up here."
                : "Head to Discover to find people worth a like."
            }
            actionLabel={tab === "outgoing" ? "Discover people" : undefined}
            actionHref={tab === "outgoing" ? "/discover" : undefined}
          />
        ) : (
          <AnimatePresence mode="popLayout">
            {items.map((entry) => (
              <LikeCard
                key={entry.likeId}
                entry={entry}
                mode={tab}
                isProcessing={processingId === entry.likeId}
                onAccept={tab === "incoming" ? () => handleAccept(entry.likeId) : undefined}
                onReject={tab === "incoming" ? () => handleReject(entry.likeId) : undefined}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
