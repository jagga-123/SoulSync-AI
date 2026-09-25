"use client";

import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { MatchCard } from "@/components/matches/match-card";
import { EmptyState } from "@/components/shared/empty-state";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { getMatches } from "@/lib/api/matches";
import { ApiClientError } from "@/lib/api-client";
import type { MatchEntry } from "@/types/api";

export function MatchesView() {
  const { user, isLoading: isAuthLoading } = useRequireAuth();
  const [matches, setMatches] = useState<MatchEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    getMatches()
      .then((res) => {
        if (active) setMatches(res.matches);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof ApiClientError ? err.message : "Couldn't load your matches.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  if (isAuthLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-4xl px-4 py-28 sm:px-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold text-white sm:text-4xl">
          Your matches
        </h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-white/55">
          Everyone you&apos;ve both said yes to.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mx-auto mt-6 max-w-2xl">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-10">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 animate-spin text-white/60" />
          </div>
        ) : matches.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="No matches yet"
            description="Accept an incoming like, or discover people and send one yourself — matches show up here the moment they happen."
            actionLabel="Discover people"
            actionHref="/discover"
          />
        ) : (
          <div className="space-y-6">
            {matches.map((match) => (
              <MatchCard key={match.matchId} match={match} onBlocked={(id) => setMatches((prev) => prev.filter((m) => m.user.id !== id))} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
