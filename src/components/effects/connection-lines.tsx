interface Point {
  x: number;
  y: number;
}

interface ConnectionLinesProps {
  points: [Point, Point, Point];
  className?: string;
}

export function ConnectionLines({ points, className = "" }: ConnectionLinesProps) {
  const [a, b, c] = points;
  const paths = [
    `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
    `M ${b.x} ${b.y} L ${c.x} ${c.y}`,
    `M ${c.x} ${c.y} L ${a.x} ${a.y}`,
  ];

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-0 size-full overflow-visible ${className}`}
    >
      <defs>
        <linearGradient id="connection-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="50%" stopColor="var(--secondary)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
      </defs>

      {paths.map((d, i) => (
        <path
          key={d}
          d={d}
          vectorEffect="non-scaling-stroke"
          fill="none"
          stroke="url(#connection-gradient)"
          strokeWidth={1}
          strokeLinecap="round"
          strokeDasharray="4 3"
          opacity={0.45}
          className="animate-line-flow"
          style={{ animationDelay: `${i * 0.4}s` }}
        />
      ))}

      {paths.map((d, i) => (
        <circle key={`dot-${d}`} r={1.6} fill="white" opacity={0.9}>
          <animateMotion
            dur={`${3.2 + i * 0.6}s`}
            repeatCount="indefinite"
            path={d}
            begin={`${i * 0.5}s`}
          />
        </circle>
      ))}
    </svg>
  );
}
