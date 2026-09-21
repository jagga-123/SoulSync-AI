"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/gate";

/**
 * Loads data on mount (and whenever `deps` change) with loading and error state.
 * `reload()` refetches without clearing what's already on screen.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: ReadonlyArray<unknown> = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestId = useRef(0);

  const load = useCallback(async (showSpinner: boolean) => {
    const id = ++requestId.current;
    if (showSpinner) setIsLoading(true);
    try {
      const result = await fetcherRef.current();
      if (id === requestId.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err, "Couldn't load this."));
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, isLoading, reload: () => load(false), setData };
}
