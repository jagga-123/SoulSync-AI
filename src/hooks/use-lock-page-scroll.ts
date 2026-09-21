"use client";

import { useEffect } from "react";

/**
 * Locks window scrolling (and returns to the top) while a full-viewport,
 * app-style screen is mounted. Those screens manage their own internal
 * scrolling; without the lock the site footer below <main> makes the page
 * taller than the viewport, so the window can scroll and slide the screen out
 * from under the user — notably when the screen replaces a taller page in place
 * (no navigation, so the browser keeps the old scroll offset).
 */
export function useLockPageScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtml = html.style.overflow;
    const previousBody = body.style.overflow;

    window.scrollTo(0, 0);
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      html.style.overflow = previousHtml;
      body.style.overflow = previousBody;
    };
  }, [active]);
}
