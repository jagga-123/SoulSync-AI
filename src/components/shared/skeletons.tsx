import { Heart } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

/** The Discover grid: 2-up on phones, 3-up on tablets, 4-up on desktop. Shared so the skeleton is exactly the real layout. */
export const PROFILE_GRID = "grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 xl:grid-cols-4 xl:gap-6";

/** A stand-in with the same size and structure as a profile card: photo block with a resting heart, name, chips, button. */
export function ProfileCardSkeleton() {
  return (
    <div aria-hidden className="overflow-hidden rounded-3xl border border-white/10 bg-card">
      <div className="skeleton-pulse relative flex aspect-[4/5] items-center justify-center bg-muted">
        <Heart className="size-10 fill-white/15 text-white/15" />
        <div className="absolute inset-x-3 bottom-3 space-y-2">
          <Skeleton className="h-4 w-2/3 bg-white/10" />
          <Skeleton className="h-3 w-1/3 bg-white/10" />
        </div>
      </div>
      <div className="space-y-3 p-3 sm:p-4">
        <Skeleton className="h-3 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-full" />
        </div>
        <Skeleton className="h-11 w-full rounded-full" />
      </div>
    </div>
  );
}

/** Six card skeletons in the real grid, announced once as "Loading people". */
export function ProfileGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading people">
      <div className={PROFILE_GRID}>
        {Array.from({ length: count }, (_, i) => (
          <ProfileCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** A row of the Likes list: photo, two lines, two round buttons. */
export function LikeRowSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <Skeleton className="size-16 shrink-0 rounded-2xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="size-11 rounded-full" />
      <Skeleton className="size-11 rounded-full" />
    </div>
  );
}

export function LikesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading likes" className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <LikeRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** The notification list: an icon tile and two lines, five times over. */
export function NotificationsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading notifications" className="divide-y divide-white/5 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden className="flex items-start gap-3 px-4 py-4">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </div>
  );
}

/** A match card: photo, name lines, a label chip, and the "why" block. */
export function MatchCardSkeleton() {
  return (
    <div aria-hidden className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
      <div className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:gap-6">
        <Skeleton className="size-24 shrink-0 rounded-2xl" />
        <div className="w-full flex-1 space-y-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
          <Skeleton className="h-3 w-1/5" />
        </div>
        <Skeleton className="h-7 w-32 rounded-full" />
      </div>
      <div className="mx-6 mb-5 space-y-2 rounded-2xl border border-white/10 p-4">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <div className="px-6 pb-6">
        <Skeleton className="h-10 w-full rounded-full" />
      </div>
    </div>
  );
}

export function MatchesSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading matches" className="space-y-6">
      {Array.from({ length: count }, (_, i) => (
        <MatchCardSkeleton key={i} />
      ))}
    </div>
  );
}
