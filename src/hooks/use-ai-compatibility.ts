"use client";

import { useCallback, useEffect, useState } from "react";
import { getCompatibility } from "@/lib/api/ai";
import { ApiClientError } from "@/lib/api-client";
import type { AICompatibilityDetail } from "@/types/api";

export type AICompatibilityState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: AICompatibilityDetail; fromCache: boolean }
  | { status: "unavailable"; reason: "viewer_not_ready" | "other_not_ready" }
  | { status: "error"; message: string };

// A short-lived in-memory cache so revisiting the page (or a card remounting)
// doesn't refetch — and doesn't replay the "AI is analysing" state — for
// something that was just computed. It's per browser tab and never persisted.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; state: AICompatibilityState }>();

function readCache(userId: string): AICompatibilityState | null {
  const hit = cache.get(userId);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(userId);
    return null;
  }
  return hit.state;
}

/**
 * Loads the AI compatibility between the signed-in user and `userId`.
 * `enabled` lets a list defer the request until a card scrolls into view.
 */
export function useAICompatibility(userId: string, enabled: boolean) {
  const [state, setState] = useState<AICompatibilityState>(() => {
    const cached = readCache(userId);
    return cached && cached.status === "ready" ? { ...cached, fromCache: true } : cached ?? { status: "idle" };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const cached = readCache(userId);
    if (cached && attempt === 0) {
      setState(cached.status === "ready" ? { ...cached, fromCache: true } : cached);
      return;
    }

    let active = true;
    setState({ status: "loading" });

    getCompatibility(userId)
      .then((result) => {
        if (!active) return;
        const next: AICompatibilityState = result.available
          ? { status: "ready", data: result.compatibility, fromCache: false }
          : { status: "unavailable", reason: result.reason };
        cache.set(userId, { at: Date.now(), state: next });
        setState(next);
      })
      .catch((err) => {
        if (!active) return;
        setState({
          status: "error",
          message: err instanceof ApiClientError ? err.message : "Couldn't load AI insights.",
        });
      });

    return () => {
      active = false;
    };
  }, [userId, enabled, attempt]);

  const retry = useCallback(() => {
    cache.delete(userId);
    setAttempt((n) => n + 1);
  }, [userId]);

  return { state, retry };
}
