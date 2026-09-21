"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api-client";
import { clearToken, getToken } from "@/lib/auth-storage";
import type { AuthUser } from "@/types/api";

/**
 * Client-side route guard: redirects to /login when there's no stored token,
 * or when the token is rejected by the API (expired / user deleted).
 * Used by pages under the authenticated area (onboarding, dashboard).
 */
const RETRY_DELAYS_MS = [700, 1800, 4000];

export function useRequireAuth() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function check() {
      if (!getToken()) {
        router.replace("/login");
        return;
      }

      // Transient failures (offline, a 5xx, a busy server) are retried a few times before giving up.
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          const { user } = await getCurrentUser();
          if (active) {
            setUser(user);
            setIsLoading(false);
          }
          return;
        } catch (err) {
          // Only a genuine authentication failure ends the session. A network error, a 5xx, a rate
          // limit, or the page navigating away mid-request must not log someone out.
          if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
            clearToken();
            if (active) router.replace("/login");
            return;
          }
          const delay = RETRY_DELAYS_MS[attempt];
          if (delay === undefined || !active) break;
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (!active) return;
        }
      }
      // Still failing: send them to sign in again, but keep the token — it may well be fine.
      if (active) router.replace("/login");
    }

    check();
    return () => {
      active = false;
    };
    // Only needs to run once on mount; `router` is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, isLoading };
}
