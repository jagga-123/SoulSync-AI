"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function AuroraBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const layer1 = useRef<HTMLDivElement>(null);
  const layer2 = useRef<HTMLDivElement>(null);
  const layer3 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const layers = [
        { el: layer1.current, distance: 140 },
        { el: layer2.current, distance: -110 },
        { el: layer3.current, distance: 90 },
      ];

      layers.forEach(({ el, distance }) => {
        if (!el) return;
        gsap.to(el, {
          y: distance,
          ease: "none",
          scrollTrigger: {
            trigger: document.body,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.8,
          },
        });
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background"
    >
      <div className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent)]" />

      <div
        ref={layer1}
        className="absolute left-1/2 top-[-10%] h-[60vw] w-[60vw] max-h-[720px] max-w-[720px] -translate-x-1/2 animate-aurora-1"
      >
        <div className="size-full animate-blob-morph bg-primary/30 blur-[120px]" />
      </div>

      <div
        ref={layer2}
        className="absolute right-[-10%] top-[10%] h-[48vw] w-[48vw] max-h-[600px] max-w-[600px] animate-aurora-2"
      >
        <div className="size-full animate-blob-morph bg-secondary/35 blur-[110px] [animation-delay:-4s]" />
      </div>

      <div
        ref={layer3}
        className="absolute bottom-[-15%] left-[-10%] h-[50vw] w-[50vw] max-h-[640px] max-w-[640px] animate-aurora-3"
      >
        <div className="size-full animate-blob-morph bg-accent/20 blur-[130px] [animation-delay:-8s]" />
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_0%,transparent_40%,#050816_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
