interface OrbitParticlesProps {
  size?: number;
  count?: number;
  reverse?: boolean;
  duration?: number;
  className?: string;
  colorClassName?: string;
}

export function OrbitParticles({
  size = 220,
  count = 4,
  reverse = false,
  duration = 16,
  className = "",
  colorClassName = "bg-accent text-accent",
}: OrbitParticlesProps) {
  const radius = size / 2;

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute left-1/2 top-1/2 -z-10 ${className}`}
      style={{
        width: size,
        height: size,
        marginLeft: -radius,
        marginTop: -radius,
        animation: `${reverse ? "spin-reverse" : "spin"} ${duration}s linear infinite`,
      }}
    >
      {Array.from({ length: count }, (_, i) => {
        const angle = (360 / count) * i;
        return (
          <span
            key={i}
            className={`absolute size-1.5 rounded-full ${colorClassName} opacity-70`}
            style={{
              top: "50%",
              left: "50%",
              transform: `rotate(${angle}deg) translate(${radius}px) rotate(-${angle}deg)`,
              boxShadow: "0 0 8px 1px currentColor",
            }}
          />
        );
      })}
    </div>
  );
}
