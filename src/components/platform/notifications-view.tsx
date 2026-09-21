"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellOff, CheckCheck, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AppPage } from "@/components/platform/app-page";
import { NotificationRow } from "@/components/platform/notification-row";
import { usePlatform } from "@/components/platform/platform-provider";
import { EmptyState } from "@/components/shared/empty-state";
import { deleteNotification, getNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/api/platform";
import { errorMessage } from "@/lib/gate";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types/platform";

const PAGE_SIZE = 20;

export function NotificationsView() {
  return (
    <AppPage title="Notifications" description="Likes, matches, messages and AI recommendations — all in one place.">
      {() => <NotificationCenter />}
    </AppPage>
  );
}

function NotificationCenter() {
  const { recent, setUnreadCount, unreadCount } = usePlatform();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const load = useCallback(
    async (pageToLoad: number, mode: "replace" | "append") => {
      try {
        const result = await getNotifications({ page: pageToLoad, limit: PAGE_SIZE, unreadOnly: filterRef.current === "unread" });
        setItems((prev) => (mode === "append" ? [...prev, ...result.notifications.filter((n) => !prev.some((p) => p.id === n.id))] : result.notifications));
        setPage(pageToLoad);
        setHasMore(result.pagination.hasMore);
        setUnreadCount(result.unreadCount);
        setError(null);
      } catch (err) {
        setError(errorMessage(err, "Couldn't load your notifications."));
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [setUnreadCount],
  );

  useEffect(() => {
    setIsLoading(true);
    void load(1, "replace");
  }, [filter, load]);

  // A live notification arrived over the socket: refresh the top of the list.
  const latest = recent[0] ? `${recent[0].id}:${recent[0].updatedAt}` : "";
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void load(1, "replace");
  }, [latest, load]);

  async function open(notification: AppNotification) {
    if (notification.isRead) return;
    setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)));
    await markNotificationRead(notification.id).catch(() => {});
    setUnreadCount(Math.max(0, unreadCount - 1));
  }

  async function remove(notification: AppNotification) {
    setItems((prev) => prev.filter((n) => n.id !== notification.id));
    await deleteNotification(notification.id).catch(() => {});
    if (!notification.isRead) setUnreadCount(Math.max(0, unreadCount - 1));
  }

  async function readAll() {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    await markAllNotificationsRead().catch(() => {});
    if (filter === "unread") setItems([]);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter notifications" className="flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(["all", "unread"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                filter === value ? "bg-gradient-brand text-white" : "text-white/60 hover:text-white",
              )}
            >
              {value}
              {value === "unread" && unreadCount > 0 && <span className="ml-1.5 text-xs opacity-80">{unreadCount}</span>}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void readAll()}
          disabled={unreadCount === 0}
          className="gap-1.5 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]"
        >
          <CheckCheck className="size-3.5" />
          Mark all as read
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20 text-white/40">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={filter === "unread" ? "No unread notifications" : "Nothing here yet"}
          description="When someone likes you, you match, or your AI recommendations update, you'll see it here — instantly."
          actionLabel="Discover people"
          actionHref="/discover"
        />
      ) : (
        <div className="glass divide-y divide-white/5 overflow-hidden rounded-3xl">
          {items.map((n) => (
            <NotificationRow key={n.id} notification={n} onOpen={open} onDelete={remove} />
          ))}
        </div>
      )}

      {hasMore && !isLoading && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={isLoadingMore}
            onClick={() => {
              setIsLoadingMore(true);
              void load(page + 1, "append");
            }}
            className="gap-2 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]"
          >
            {isLoadingMore && <Loader2 className="size-4 animate-spin" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
