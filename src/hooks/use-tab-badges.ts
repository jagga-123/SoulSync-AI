"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getConversations } from "@/lib/api/conversations";
import { getIncomingLikes } from "@/lib/api/likes";

export interface TabBadges {
  likes: number;
  messages: number;
}

const MIN_INTERVAL_MS = 20_000;

/**
 * Small "new" counts for the Likes and Messages tabs. Uses the two list endpoints that already exist (no new API):
 * refreshed when the member changes screen or returns to the tab, at most once every 20 s. Failures are silent —
 * a badge must never get in the way of navigating.
 */
export function useTabBadges(enabled: boolean, pathname: string): TabBadges {
  const [badges, setBadges] = useState<TabBadges>({ likes: 0, messages: 0 });
  const lastRun = useRef(0);

  const refresh = useCallback(async () => {
    lastRun.current = Date.now();
    const [likes, conversations] = await Promise.allSettled([getIncomingLikes(), getConversations()]);
    setBadges((prev) => ({
      likes: likes.status === "fulfilled" ? likes.value.likes.length : prev.likes,
      messages:
        conversations.status === "fulfilled"
          ? conversations.value.conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0)
          : prev.messages,
    }));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (Date.now() - lastRun.current < MIN_INTERVAL_MS) return;
    void refresh();
  }, [enabled, pathname, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRun.current >= MIN_INTERVAL_MS) void refresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, refresh]);

  return enabled ? badges : { likes: 0, messages: 0 };
}
