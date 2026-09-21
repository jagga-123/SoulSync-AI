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

interface Node {
  x: number;
  y: number;
}

// Math.cos/Math.sin aren't guaranteed bit-identical across JS engine builds
// (unlike +,-,*,/ and Math.sqrt, they're only spec'd as "approximated"), so
// Node's SSR run and the browser's hydration run can compute a last-bit-different
// float from the same seed. Rounding collapses that drift before it can
// trigger a hydration mismatch.
function round(n: number, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(n * factor) / factor;
}

function generateBrainNodes(count: number, seed: number): Node[] {
  const random = mulberry32(seed);
  const nodes: Node[] = [];

  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const radiusX = 34 + random() * 16;
    const radiusY = 26 + random() * 14;
    const r = Math.sqrt(random());
    nodes.push({
      x: round(50 + Math.cos(angle) * radiusX * r),
      y: round(48 + Math.sin(angle) * radiusY * r * 0.9),
    });
  }

  return nodes;
}

function nearestPairs(nodes: Node[], neighborsPerNode: number) {
  const edges: [number, number][] = [];
  const seen = new Set<string>();

  nodes.forEach((node, i) => {
    const distances = nodes
      .map((other, j) => ({
        j,
        d: (other.x - node.x) ** 2 + (other.y - node.y) ** 2,
      }))
      .filter((entry) => entry.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, neighborsPerNode);

    distances.forEach(({ j }) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([i, j]);
      }
    });
  });

  return edges;
}

interface AIBrainVisualizationProps {
  className?: string;
  nodeCount?: number;
  seed?: number;
}

export function AIBrainVisualization({
  className = "",
  nodeCount = 22,
  seed = 11,
}: AIBrainVisualizationProps) {
  const nodes = generateBrainNodes(nodeCount, seed);
  const edges = nearestPairs(nodes, 2);
  const random = mulberry32(seed + 1);

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      className={`pointer-events-none absolute ${className}`}
    >
      <defs>
        <radialGradient id="brain-node-gradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--secondary)" />
        </radialGradient>
      </defs>

      <g className="animate-brain-pulse" style={{ transformOrigin: "50% 48%" }}>
        {edges.map(([i, j]) => (
          <line
            key={`${i}-${j}`}
            x1={nodes[i].x}
            y1={nodes[i].y}
            x2={nodes[j].x}
            y2={nodes[j].y}
            stroke="url(#brain-node-gradient)"
            strokeWidth={0.15}
            opacity={0.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {nodes.map((node, i) => (
          <circle
            key={i}
            cx={node.x}
            cy={node.y}
            r={0.55 + random() * 0.35}
            fill="url(#brain-node-gradient)"
            className="animate-node-pulse"
            style={{ animationDelay: `${(i % 7) * 0.4}s` }}
          />
        ))}
      </g>
    </svg>
  );
}
