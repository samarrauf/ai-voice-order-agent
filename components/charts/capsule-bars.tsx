import type { CSSProperties } from "react";
import { cn } from "@/components/ui/cn";

export type CapsuleDatum = {
  /** Short axis label ("14", "Mon"). */
  label: string;
  /** Tooltip heading; defaults to `label`. */
  title?: string;
  value: number;
  /** Already formatted for the tooltip (e.g. money from formatMoney). */
  valueLabel: string;
};

/**
 * Bar chart with pill-shaped bars. Each bar takes the next colour of the restaurant's
 * chart palette (--chart-1..8, lib/chart-palette.ts); on hover or keyboard focus it turns
 * to the accent colour and a tooltip appears above it. Pure CSS (no JS, no chart package),
 * bars grow up from the bottom (animation off for reduced motion / Lite mode, globals.css).
 * `labelEvery` shows only every n-th axis label when there are many bars.
 */
export function CapsuleBars({
  data,
  height = 220,
  labelEvery = 1,
  ariaLabel,
  className,
}: {
  data: readonly CapsuleDatum[];
  height?: number;
  labelEvery?: number;
  ariaLabel: string;
  className?: string;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const n = data.length;
  return (
    <div role="group" aria-label={ariaLabel} className={cn("cbars", className)} style={{ "--h": `${height}px` } as CSSProperties}>
      {data.map((d, i) => {
        const pct = max > 0 && d.value > 0 ? Math.max(4, (d.value / max) * 100) : 0;
        const edge = n > 4 && i < 2 ? "cbar-tip--l" : n > 4 && i >= n - 2 ? "cbar-tip--r" : "";
        return (
          <div
            key={`${d.label}-${i}`}
            tabIndex={0}
            role="img"
            aria-label={`${d.title ?? d.label}: ${d.valueLabel}`}
            className="cbar"
            style={{ "--i": i, "--bar": `var(--chart-${(i % 8) + 1})`, "--v": `${pct}%` } as CSSProperties}
          >
            <div className="cbar-track">
              <span aria-hidden className={cn("cbar-tip", edge)}>
                <b>{d.title ?? d.label}</b>
                {d.valueLabel}
              </span>
              <span aria-hidden className={cn("cbar-fill", pct === 0 && "cbar-fill--zero")} />
            </div>
            <span aria-hidden className="cbar-label">
              {i % labelEvery === 0 ? d.label : " "}
            </span>
          </div>
        );
      })}
    </div>
  );
}
