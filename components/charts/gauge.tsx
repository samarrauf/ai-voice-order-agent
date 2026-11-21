import type { ReactNode } from "react";
import { CountUp } from "@/components/ui/count-up";

/**
 * Half-circle gauge for one percentage (0-100, clamped). The arc fills in with CSS,
 * the figure in the middle counts up. `caption` sits under the figure.
 */
export function Gauge({ percent, caption, ariaLabel, colorIndex = 1 }: { percent: number; caption?: ReactNode; ariaLabel: string; colorIndex?: number }) {
  const p = Number.isFinite(percent) ? Math.min(100, Math.max(0, Math.round(percent))) : 0;
  return (
    <div className="gauge" role="img" aria-label={`${ariaLabel}: ${p}%`}>
      <svg viewBox="0 0 120 68" aria-hidden>
        <path d="M 10 62 A 50 50 0 0 1 110 62" pathLength={100} fill="none" strokeWidth="12" strokeLinecap="round" className="gauge-track" />
        {p > 0 && (
          <path
            d="M 10 62 A 50 50 0 0 1 110 62"
            pathLength={100}
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            className="gauge-arc"
            style={{ stroke: `var(--chart-${colorIndex})`, strokeDasharray: `${p} 100` }}
          />
        )}
      </svg>
      <div className="gauge-center">
        <CountUp value={p} suffix="%" className="gauge-figure" />
        {caption && <p className="gauge-caption">{caption}</p>}
      </div>
    </div>
  );
}
