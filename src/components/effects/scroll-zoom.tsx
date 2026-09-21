"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface ScrollZoomProps {
  children: ReactNode;
  className?: string;
  from?: number;
  to?: number;
  start?: string;
  end?: string;
}

export function ScrollZoom({
  children,
  className = "",
  from = 0.86,
  to = 1,
  start = "top 88%",
  end = "top 45%",
}: ScrollZoomProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { scale: from, opacity: 0.35 },
        {
          scale: to,
          opacity: 1,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start,
            end,
            scrub: 0.6,
          },
        },
      );
    }, ref);

    return () => ctx.revert();
  }, [from, to, start, end]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
