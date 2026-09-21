"use client";

import { useEffect } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from "framer-motion";

export function SpotlightCursor() {
  const mouseX = useMotionValue(-400);
  const mouseY = useMotionValue(-400);

  const springX = useSpring(mouseX, { damping: 34, stiffness: 220, mass: 0.4 });
  const springY = useSpring(mouseY, { damping: 34, stiffness: 220, mass: 0.4 });

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      mouseX.set(event.clientX);
      mouseY.set(event.clientY);
    }

    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [mouseX, mouseY]);

  const background = useMotionTemplate`radial-gradient(600px circle at ${springX}px ${springY}px, color-mix(in oklch, var(--primary) 16%, transparent), transparent 70%)`;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-20 hidden md:block"
      style={{ background }}
    />
  );
}
