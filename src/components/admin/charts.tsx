"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Table2, LineChart as LineChartIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FunnelStep } from "@/types/platform";

/**
 * Chart colours. The series hue was stepped into the dark-mode lightness band
 * and validated (lightness, chroma, CVD separation, contrast) against the
 * card surface with the data-viz palette validator. Text never wears the series
 * colour — labels use the text tokens; the mark carries identity.
 */
const SERIES = "#0fa1be";
const SURFACE = "#0b1026";
const GRID = "rgba(255,255,255,0.08)";
const AXIS_TEXT = "rgba(255,255,255,0.45)";

const number = new Intl.NumberFormat("en-US");
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Round the top of the axis up to a clean number (1, 2, 5 × 10ⁿ) and split it into steps. */
function niceScale(max: number, steps = 4): { top: number; ticks: number[] } {
  // These are counts: never label a fractional tick ("1.5 registrations"). Small maxima get one tick per whole number.
  if (max <= steps) {
    const top = Math.max(2, Math.ceil(max));
    return { top, ticks: Array.from({ length: top + 1 }, (_, i) => i) };
  }
  const rough = max / steps;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10) * magnitude;
  const top = step * steps;
  return { top, ticks: Array.from({ length: steps + 1 }, (_, i) => i * step) };
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    setWidth(Math.floor(element.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

// ---------------------------------------------------------------------------
// Area/line chart — one series over time
// ---------------------------------------------------------------------------

interface AreaChartProps {
  points: Array<{ date: string; value: number }>;
  /** What is being counted, e.g. "registrations" — used in the tooltip and table. */
  unit: string;
  height?: number;
}

export function AreaChart({ points, unit, height = 240 }: AreaChartProps) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");

  const margin = { top: 16, right: 56, bottom: 26, left: 44 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;

  const max = Math.max(0, ...points.map((p) => p.value));
  const { top, ticks } = useMemo(() => niceScale(max), [max]);
  const x = useCallback((i: number) => margin.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW), [points.length, innerW, margin.left]);
  const y = useCallback((v: number) => margin.top + innerH - (v / top) * innerH, [top, innerH, margin.top]);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = points.length ? `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : "";

  const last = points.length - 1;
  const active = hover ?? last;
  const total = points.reduce((sum, p) => sum + p.value, 0);

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (points.length === 0 || innerW === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rel = (event.clientX - rect.left - margin.left) / innerW;
    setHover(Math.min(last, Math.max(0, Math.round(rel * last))));
  }
  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "ArrowLeft") setHover(Math.max(0, (hover ?? last) - 1));
    else if (event.key === "ArrowRight") setHover(Math.min(last, (hover ?? last) + 1));
    else if (event.key === "Escape") setHover(null);
    else return;
    event.preventDefault();
  }

  const labelIdx = points.length > 2 ? [0, Math.round(last / 2), last] : points.map((_, i) => i);
  const hovered = hover !== null ? points[hover] : undefined;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-white/60">
          {number.format(total)} {unit} in the last {points.length} days
        </p>
        <button
          type="button"
          onClick={() => setView((v) => (v === "chart" ? "table" : "chart"))}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-white/55 transition-colors hover:bg-white/8 hover:text-white"
        >
          {view === "chart" ? <Table2 className="size-3.5" /> : <LineChartIcon className="size-3.5" />}
          {view === "chart" ? "View as table" : "View as chart"}
        </button>
      </div>

      {view === "table" ? (
        <div data-lenis-prevent className="max-h-60 overflow-y-auto rounded-xl border border-white/8">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#0b1026] text-xs uppercase tracking-wider text-white/60">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium capitalize">{unit}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[...points].reverse().map((p) => (
                <tr key={p.date}>
                  <td className="px-3 py-1.5 text-white/65">{longDate(p.date)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-white">{number.format(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} className="relative" style={{ height }}>
          {width > 0 && (
            <svg
              width={width}
              height={height}
              role="img"
              tabIndex={0}
              aria-label={`Daily ${unit}, last ${points.length} days. ${number.format(total)} total. Use the left and right arrow keys to read each day.`}
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHover(null)}
              onKeyDown={onKeyDown}
              onBlur={() => setHover(null)}
              className="touch-pan-y overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {/* Recessive hairline grid + y ticks */}
              {ticks.map((tick) => (
                <g key={tick}>
                  <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke={GRID} strokeWidth={1} />
                  <text x={margin.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={AXIS_TEXT}>
                    {number.format(tick)}
                  </text>
                </g>
              ))}
              {labelIdx.map((i, n) => (
                <text
                  key={i}
                  x={x(i)}
                  y={height - 6}
                  textAnchor={n === 0 && labelIdx.length > 1 ? "start" : n === labelIdx.length - 1 && labelIdx.length > 1 ? "end" : "middle"}
                  fontSize={11}
                  fill={AXIS_TEXT}
                >
                  {points[i] ? shortDate(points[i]!.date) : ""}
                </text>
              ))}

              {/* Area wash (~10%) and a 2px line */}
              <path d={area} fill={SERIES} fillOpacity={0.1} />
              <path d={line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

              {/* Crosshair */}
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={margin.top} y2={margin.top + innerH} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />}

              {/* Marker: >= 8px with a 2px surface ring, so it stays legible over the line */}
              {points[active] && (
                <>
                  <circle cx={x(active)} cy={y(points[active]!.value)} r={6} fill={SURFACE} />
                  <circle cx={x(active)} cy={y(points[active]!.value)} r={4} fill={SERIES} />
                </>
              )}

              {/* Direct label on the latest value only — never a number on every point */}
              {hover === null && points[last] && (
                <text x={x(last) + 12} y={y(points[last]!.value)} dominantBaseline="middle" fontSize={12} fontWeight={600} fill="rgba(255,255,255,0.85)">
                  {number.format(points[last]!.value)}
                </text>
              )}
            </svg>
          )}

          {hovered && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 rounded-lg border border-white/10 bg-[#141a35] px-3 py-2 text-xs shadow-xl shadow-black/40"
              style={{ left: Math.min(Math.max(x(hover!) - 60, 0), Math.max(0, width - 130)), top: 0 }}
            >
              <p className="text-white/50">{longDate(hovered.date)}</p>
              <p className="mt-0.5 flex items-center gap-1.5 font-semibold text-white">
                <span className="size-2 rounded-full" style={{ background: SERIES }} />
                {number.format(hovered.value)} <span className="font-normal text-white/50">{unit}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Funnel — horizontal bars with drop-off
// ---------------------------------------------------------------------------

export function FunnelBars({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(1, ...steps.map((s) => s.count));

  return (
    <ol className="space-y-1.5">
      {steps.map((step) => {
        const pct = (step.count / max) * 100;
        return (
          <li key={step.key} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[13rem_1fr_auto]" title={`${step.label}: ${number.format(step.count)}${step.fromPrevious !== null ? ` (${step.fromPrevious}% of previous step)` : ""}`}>
            <span className="truncate text-white/70">{step.label}</span>
            {/* ≤24px thick, 4px rounded data end, square at the baseline */}
            <span className="block h-5">
              <span className="block h-5 rounded-r-[4px]" style={{ width: `${Math.max(pct, step.count > 0 ? 1 : 0)}%`, background: SERIES }} />
            </span>
            <span className="min-w-[7.5rem] text-right tabular-nums text-white">
              {number.format(step.count)}
              <span className="ml-2 text-xs text-white/60">{step.fromPrevious === null ? "" : `${step.fromPrevious}%`}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------

interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Secondary line, e.g. "+12 in the last 7 days". */
  sub?: ReactNode;
  className?: string;
  hero?: boolean;
}

export function StatTile({ label, value, sub, className, hero }: StatTileProps) {
  return (
    <div className={cn("glass rounded-2xl p-5", className)}>
      <p className="text-xs font-medium text-white/50">{label}</p>
      <p className={cn("mt-2 font-semibold text-white", hero ? "text-5xl" : "text-3xl")}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-white/60">{sub}</p>}
    </div>
  );
}

export const formatNumber = (n: number) => number.format(n);
export const formatPercent = (n: number | null) => (n === null ? "—" : `${n}%`);
