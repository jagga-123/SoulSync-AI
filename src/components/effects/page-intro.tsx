"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Heart } from "lucide-react";

const STORAGE_KEY = "soulsync-intro-shown";

export function PageIntro() {
  const [show, setShow] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      alreadyShown = false;
    }
    if (!alreadyShown) setShow(true);
  }, []);

  useEffect(() => {
    if (!show) return;

    document.body.style.overflow = "hidden";
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      document.body.style.overflow = "";
      setShow(false);
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // sessionStorage unavailable (private mode) — intro will replay, which is fine.
      }
    }

    const tl = gsap.timeline({ onComplete: finish });

    tl.fromTo(
      markRef.current,
      { opacity: 0, scale: 0.7, filter: "blur(6px)" },
      {
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        duration: 0.55,
        ease: "power3.out",
      },
    )
      .fromTo(
        barRef.current,
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 0.5,
          ease: "power2.inOut",
          transformOrigin: "left center",
        },
        "-=0.1",
      )
      .to({}, { duration: 0.3 })
      .to(markRef.current, {
        opacity: 0,
        scale: 0.92,
        duration: 0.35,
        ease: "power2.in",
      })
      .to(
        rootRef.current,
        { yPercent: -100, duration: 0.65, ease: "power3.inOut" },
        "-=0.1",
      );

    function handleSkip() {
      tl.kill();
      finish();
    }
    window.addEventListener("pointerdown", handleSkip, { once: true });

    return () => {
      window.removeEventListener("pointerdown", handleSkip);
      tl.kill();
      document.body.style.overflow = "";
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-background"
    >
      <div ref={markRef} className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-brand shadow-lg shadow-primary/30">
          <Heart className="size-6 fill-white text-white" />
        </span>
        <span className="font-display text-2xl font-semibold text-white">
          SoulSync <span className="text-gradient-brand">AI</span>
        </span>
      </div>
      <div className="h-px w-40 overflow-hidden rounded-full bg-white/10">
        <div
          ref={barRef}
          className="h-full w-full origin-left scale-x-0 bg-gradient-to-r from-primary via-secondary to-accent"
        />
      </div>
    </div>
  );
}
