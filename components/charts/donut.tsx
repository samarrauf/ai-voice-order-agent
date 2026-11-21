import type { CSSProperties, ReactNode } from "react";
import { sharePercents } from "@/lib/dashboard-stats";

export type DonutSlice = { label: string; value: number };

const GAP = 1.2; // visible gap between slices, in % of the ring

/**
 * Ring chart with a legend. Every slice has its own colour from the chart palette
 * (--chart-1..8) and the legend dots use the same colours. Percentages are whole
 * numbers that add up to exactly 100 (sharePercents). The ring fills in with CSS.
 * `center` goes in the hole (a number and a label, for instance).
 */
export function Donut({ slices, center, ariaLabel }: { slices: readonly DonutSlice[]; center?: ReactNode; ariaLabel: string }) {
  const pct = sharePercents(slices.map((s) => s.value));
  const shown = pct.filter((p) => p > 0).length;
  const starts = pct.map((_, i) => pct.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className="donut">
      <div className="donut-ring" role="img" aria-label={ariaLabel}>
        <svg viewBox="0 0 120 120" aria-hidden>
          <circle cx="60" cy="60" r="46" pathLength={100} fill="none" strokeWidth="14" className="donut-track" />
          {slices.map((s, i) => {
            const p = pct[i];
            if (p <= 0) return null;
            const len = shown > 1 ? Math.max(0.5, p - GAP) : p;
            const start = starts[i];
            return (
              <circle
                key={s.label}
                cx="60"
                cy="60"
                r="46"
                pathLength={100}
                fill="none"
                strokeWidth="14"
                strokeLinecap="butt"
                className="donut-arc"
                style={{ stroke: `var(--chart-${(i % 8) + 1})`, strokeDasharray: `${len} ${100 - len}`, strokeDashoffset: -start, "--i": i } as CSSProperties}
              />
            );
          })}
        </svg>
        {center && <div className="donut-center">{center}</div>}
      </div>
      <ul className="donut-legend">
        {slices.map((s, i) => (
          <li key={s.label}>
            <span aria-hidden className="donut-dot" style={{ background: `var(--chart-${(i % 8) + 1})` }} />
            <span className="donut-name">{s.label}</span>
            <span className="donut-num">
              {s.value} <span className="text-ink-faint">· {pct[i]}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
