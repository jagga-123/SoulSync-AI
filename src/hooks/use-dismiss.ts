"use client";

import { useEffect, type RefObject } from "react";

/** Calls `onDismiss` on an outside click or the Escape key while `active`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, active: boolean, onDismiss: () => void) {
  useEffect(() => {
    if (!active) return;
    function onPointer(event: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, active, onDismiss]);
}
