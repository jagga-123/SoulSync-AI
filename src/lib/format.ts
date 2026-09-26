export function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Interests both people listed, compared ignoring case and spacing, shown the way `theirs` wrote them. */
export function sharedInterests(mine: string[], theirs: string[]): string[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const own = new Set(mine.map(norm));
  return theirs.filter((interest) => own.has(norm(interest)));
}

export const RELATIONSHIP_GOAL_LABELS: Record<string, string> = {
  casual: "Casual dating",
  serious: "Serious relationship",
  friendship: "Friendship",
  "not-sure": "Not sure yet",
};

/** Short relative timestamp for chat lists/bubbles — "2m", "3h", "5d", or a
 * short date once it's further back than a week. */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.max(0, Math.round(diffMs / 1000));

  if (diffSec < 60) return "now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "3:45 PM" style clock time, for individual message bubbles. */
export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
