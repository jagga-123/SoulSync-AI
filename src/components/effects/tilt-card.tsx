"use client";

import { useRef, type ReactNode } from "react";
import { motion, useMotionTemplate, useSpring } from "framer-motion";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  glare?: boolean;
}

export function TiltCard({
  children,
  className = "",
  maxTilt = 10,
  glare = true,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const rotateX = useSpring(0, { stiffness: 220, damping: 22, mass: 0.5 });
  const rotateY = useSpring(0, { stiffness: 220, damping: 22, mass: 0.5 });
  const glareX = useSpring(50, { stiffness: 220, damping: 22 });
  const glareY = useSpring(50, { stiffness: 220, damping: 22 });

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;

    rotateY.set((px - 0.5) * maxTilt * 2);
    rotateX.set(-(py - 0.5) * maxTilt * 2);
    glareX.set(px * 100);
    glareY.set(py * 100);
  }

  function handleMouseLeave() {
    rotateX.set(0);
    rotateY.set(0);
    glareX.set(50);
    glareY.set(50);
  }

  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, color-mix(in oklch, white 16%, transparent), transparent 60%)`;

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      className={`relative transform-gpu will-change-transform ${className}`}
    >
      {children}
      {glare && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: glareBackground }}
        />
      )}
    </motion.div>
  );
}
