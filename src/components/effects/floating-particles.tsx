import type { CSSProperties } from "react";

function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FloatingParticlesProps {
  count?: number;
  seed?: number;
  className?: string;
}

export function FloatingParticles({
  count = 26,
  seed = 7,
  className = "",
}: FloatingParticlesProps) {
  const random = mulberry32(seed);

  const particles = Array.from({ length: count }, (_, i) => {
    const size = 2 + random() * 4;
    const colorRoll = random();
    const color =
      colorRoll < 0.34
        ? "bg-primary"
        : colorRoll < 0.67
          ? "bg-secondary"
          : "bg-accent";

    return {
      id: i,
      size,
      color,
      top: random() * 100,
      left: random() * 100,
      duration: 8 + random() * 8,
      delay: random() * 6,
      dx: -20 + random() * 40,
      dy: -30 + random() * 20,
      opacity: 0.3 + random() * 0.5,
    };
  });

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className={`absolute rounded-full ${p.color} animate-particle-drift`}
          style={
            {
              top: `${p.top}%`,
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              opacity: p.opacity,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--op": p.opacity * 0.5,
              "--op-mid": p.opacity,
              filter: "blur(0.5px)",
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
