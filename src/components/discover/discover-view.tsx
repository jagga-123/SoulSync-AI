"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { ArrowRight, Loader2, Search, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProfileCard } from "@/components/discover/profile-card";
import { ProfileSheet } from "@/components/discover/profile-sheet";
import { AdvancedFilters, type AdvancedFilterValues } from "@/components/discover/advanced-filters";
import { usePlatform } from "@/components/platform/platform-provider";
import { UpgradeNotice } from "@/components/platform/upgrade-notice";
import { EmptyState } from "@/components/shared/empty-state";
import { PROFILE_GRID, ProfileGridSkeleton } from "@/components/shared/skeletons";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { getDiscoverUsers } from "@/lib/api/discover";
import { getRecommendations } from "@/lib/api/ai";
import { sendLike } from "@/lib/api/likes";
import { getMyProfile } from "@/lib/api/profile";
import { RELATIONSHIP_GOAL_LABELS } from "@/lib/format";
import { ApiClientError } from "@/lib/api-client";
import { gateOf, type Gate } from "@/lib/gate";
import { RELATIONSHIP_GOAL_OPTIONS } from "@/types/api";
import type { DiscoverUser, RelationshipGoal } from "@/types/api";

const ANY_GOAL = "any";
const PAGE_SIZE = 12;
const RECOMMENDATION_COUNT = 12;

type DiscoverMode = "recommended" | "all";

export function DiscoverView() {
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  // `null` until the first response tells us whether the viewer has an AI
  // profile — people who do land on "AI Recommended", everyone else on the
  // original list, so nobody sees a flash of the wrong view.
  const [mode, setMode] = useState<DiscoverMode | null>(null);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [recs, setRecs] = useState<DiscoverUser[] | null>(null);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);

  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cityInput, setCityInput] = useState("");
  const [city, setCity] = useState("");
  const [relationshipGoal, setRelationshipGoal] = useState<RelationshipGoal | "">("");

  // Phase 6: premium advanced filters + paywall / feature-flag notices.
  const { features, refreshFeatures } = usePlatform();
  const [advanced, setAdvanced] = useState<AdvancedFilterValues>({});
  const [gate, setGate] = useState<Gate | null>(null);

  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [likingId, setLikingId] = useState<string | null>(null);

  // The card's detail sheet, the viewer's own interests (for "N in common"), and a retry counter for the AI list.
  const [openId, setOpenId] = useState<string | null>(null);
  const [myInterests, setMyInterests] = useState<string[]>([]);
  const [recsAttempt, setRecsAttempt] = useState(0);

  const loadUsers = useCallback(
    async (targetPage: number, append: boolean) => {
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);
      setError(null);

      try {
        const result = await getDiscoverUsers({
          page: targetPage,
          limit: PAGE_SIZE,
          city: city || undefined,
          relationshipGoal: relationshipGoal || undefined,
          ...advanced,
        });
        setUsers((prev) => (append ? [...prev, ...result.users] : result.users));
        setHasMore(result.pagination.hasMore);
        setPage(targetPage);
        setAiReady(result.aiReady ?? false);
      } catch (err) {
        const blocked = gateOf(err);
        if (blocked) setGate(blocked);
        else
          setError(
            err instanceof ApiClientError ? err.message : "We couldn't load suggestions. Please try again.",
          );
      } finally {
        if (append) setIsLoadingMore(false);
        else setIsLoading(false);
      }
    },
    [city, relationshipGoal, advanced],
  );

  useEffect(() => {
    if (!user) return;
    loadUsers(1, false);
    // `loadUsers` is recreated when city/relationshipGoal change, and both
    // are already in this effect's own deps — re-listing it would just
    // duplicate the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, city, relationshipGoal, advanced]);

  // Your own interests, so each card can say what you two have in common. Best-effort: without them the cards just skip that line.
  useEffect(() => {
    if (!user) return;
    let active = true;
    getMyProfile()
      .then((res) => active && setMyInterests(res.profile.interests))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  // Pick the starting tab once we know whether AI scores exist for this viewer.
  useEffect(() => {
    if (aiReady !== null && mode === null) setMode(aiReady ? "recommended" : "all");
  }, [aiReady, mode]);

  useEffect(() => {
    if (!user || mode !== "recommended") return;
    let active = true;
    setIsLoadingRecs(true);

    getRecommendations(RECOMMENDATION_COUNT)
      .then((res) => {
        if (active) setRecs(res.recommendations.map((rec) => ({ ...rec.user, ai: rec.ai })));
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : "We couldn't load suggestions. Please try again.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoadingRecs(false);
      });

    return () => {
      active = false;
    };
  }, [user, mode, recsAttempt]);

  const hasFilters = Boolean(city || relationshipGoal || Object.values(advanced).some((x) => x !== undefined && x !== ""));

  function clearFilters() {
    setCityInput("");
    setCity("");
    setRelationshipGoal("");
    setAdvanced({});
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setCity(cityInput.trim());
  }

  async function handleLike(userId: string) {
    setLikingId(userId);
    setError(null);
    setGate(null);
    try {
      await sendLike(userId);
      setLikedIds((prev) => new Set(prev).add(userId));
      setTimeout(() => {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        setRecs((prev) => (prev ? prev.filter((u) => u.id !== userId) : prev));
      }, 900);
    } catch (err) {
      const blocked = gateOf(err);
      if (blocked) {
        setGate(blocked);
        void refreshFeatures();
      } else {
        setError(
          err instanceof ApiClientError ? err.message : "Couldn't send like. Please try again.",
        );
      }
    } finally {
      setLikingId(null);
    }
  }

  if (isAuthLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-white/50" />
      </div>
    );
  }

  const isRecommended = mode === "recommended";
  const visibleUsers: DiscoverUser[] = isRecommended ? (recs ?? []) : users;
  const listLoading = mode === null || (isRecommended ? isLoadingRecs || recs === null : isLoading);
  const openProfile = openId ? visibleUsers.find((u) => u.id === openId) : undefined;

  function retryLoad() {
    setError(null);
    if (isRecommended) {
      setRecs(null);
      setRecsAttempt((n) => n + 1);
    } else {
      void loadUsers(1, false);
    }
  }

  function removePerson(id: string) {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setRecs((prev) => (prev ? prev.filter((u) => u.id !== id) : prev));
  }

  return (
    <div className="relative mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold text-white sm:text-4xl">
          Discover people
        </h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-white/55">
          {isRecommended
            ? "Ranked by how well you fit — values, communication, lifestyle and goals."
            : "People you haven't already liked or matched with, picked for you."}
        </p>
      </div>

      {aiReady && mode !== null && (
        <div
          role="tablist"
          aria-label="Discover view"
          className="glass mx-auto mt-8 flex w-fit rounded-full p-1"
        >
          {(
            [
              { value: "recommended", label: "AI Recommended", icon: Sparkles },
              { value: "all", label: "Everyone", icon: Users },
            ] as const
          ).map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={mode === tab.value}
              onClick={() => setMode(tab.value)}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                mode === tab.value
                  ? "bg-gradient-brand text-white shadow-lg shadow-primary/25"
                  : "text-white/55 hover:text-white"
              }`}
            >
              <tab.icon className="size-4" aria-hidden />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {aiReady === false && mode === "all" && (
        <div className="glass mx-auto mt-8 flex max-w-2xl flex-col items-center gap-4 rounded-2xl p-5 text-center sm:flex-row sm:text-left">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-brand shadow-lg shadow-primary/20">
            <Sparkles className="size-5 text-white" aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">See why you’d click with people</p>
            <p className="mt-0.5 text-sm text-white/55">
              Chat with our AI for a few minutes and every profile here comes with the reasons you two might click.
            </p>
          </div>
          <Button
            asChild
            className="shrink-0 gap-2 rounded-full bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
          >
            <Link href="/ai-interview">
              Start the interview
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      )}

      {!isRecommended && (
      <form
        onSubmit={handleSearchSubmit}
        className="glass mx-auto mt-8 flex max-w-2xl flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/60" />
          <Input
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            placeholder="Search by city"
            aria-label="Search by city"
            className="pl-9"
          />
        </div>

        <Select
          value={relationshipGoal || ANY_GOAL}
          onValueChange={(value) =>
            setRelationshipGoal(value === ANY_GOAL ? "" : (value as RelationshipGoal))
          }
        >
          <SelectTrigger aria-label="Relationship goal" className="w-full sm:w-56">
            <SelectValue placeholder="Any relationship goal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_GOAL}>Any relationship goal</SelectItem>
            {RELATIONSHIP_GOAL_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {RELATIONSHIP_GOAL_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button type="submit" className="rounded-full bg-gradient-brand text-white">
          Search
        </Button>
      </form>
      )}

      {!isRecommended && features?.perks.advanced_filters.enabled && (
        <AdvancedFilters
          perk={features.perks.advanced_filters}
          value={advanced}
          onApply={(next) => {
            setGate(null);
            setAdvanced(next);
          }}
        />
      )}

      {gate && <UpgradeNotice gate={gate} className="mx-auto mt-6 max-w-2xl" />}

      {error && (
        <Alert variant="destructive" className="mx-auto mt-6 max-w-2xl">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{error}</span>
            <Button type="button" size="sm" variant="outline" onClick={retryLoad} className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10">
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-10">
        {error && visibleUsers.length === 0 ? null : listLoading ? (
          <ProfileGridSkeleton />
        ) : visibleUsers.length === 0 ? (
          isRecommended ? (
            <EmptyState
              icon={Sparkles}
              title="You're all caught up for now"
              description="You've seen everyone we can suggest right now. New people show up as more members join — meanwhile, you can browse everyone."
              actionLabel="Browse everyone"
              onAction={() => setMode("all")}
            />
          ) : hasFilters ? (
            <EmptyState
              icon={Users}
              title="No one fits those filters"
              description="Try a different city or goal — or clear the filters to see everyone."
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          ) : (
            <EmptyState
              icon={Users}
              title="No one new to show right now"
              description="You've seen everyone for now. New members join all the time — check back soon."
            />
          )
        ) : (
          <>
            <div className={PROFILE_GRID}>
              <AnimatePresence mode="popLayout">
                {visibleUsers.map((profile) => (
                  <ProfileCard
                    key={profile.id}
                    profile={profile}
                    liked={likedIds.has(profile.id)}
                    isLiking={likingId === profile.id}
                    onLike={() => handleLike(profile.id)}
                    ai={profile.ai}
                    suggested={isRecommended}
                    myInterests={myInterests}
                    onOpen={() => setOpenId(profile.id)}
                    onBlocked={removePerson}
                  />
                ))}
              </AnimatePresence>
            </div>

            {openProfile && (
              <ProfileSheet
                profile={openProfile}
                ai={openProfile.ai}
                suggested={isRecommended}
                myInterests={myInterests}
                liked={likedIds.has(openProfile.id)}
                isLiking={likingId === openProfile.id}
                onLike={() => handleLike(openProfile.id)}
                onClose={() => setOpenId(null)}
                onBlocked={removePerson}
              />
            )}

            {!isRecommended && hasMore && (
              <div className="mt-10 flex justify-center">
                <Button
                  variant="outline"
                  disabled={isLoadingMore}
                  onClick={() => loadUsers(page + 1, true)}
                  className="gap-2 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]"
                >
                  {isLoadingMore && <Loader2 className="size-4 animate-spin" />}
                  {isLoadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
