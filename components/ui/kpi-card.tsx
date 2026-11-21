import type { CSSProperties, ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "./cn";

type Delta = { percent: number; direction: "up" | "down"; versus: string };

// Whole numbers up to this size count up from 0 on load (pure CSS, see .count in globals.css).
const MAX_COUNT = 1_000_000;

/**
 * One headline number: small label, big figure, and underneath either an
 * up/down comparison ("12% vs yesterday") or a plain note.
 * `accent` fills the card with the restaurant's accent gradient (use for the first card only);
 * `icon` adds a small round icon at the top right; `tone` (1-8) colours it from the chart palette (--chart-N, lib/chart-palette.ts), so a row of cards is a mix of the theme colours.
 */
export function KpiCard({
  label,
  value,
  prefix,
  delta,
  note,
  icon,
  tone,
  accent,
  className,
}: {
  label: string;
  value: string;
  prefix?: string;
  delta?: Delta;
  note?: string;
  icon?: ReactNode;
  tone?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  accent?: boolean;
  className?: string;
}) {
  const counts = /^\d{1,7}$/.test(value) && Number(value) <= MAX_COUNT;
  return (
    <div className={cn("lift rounded-card p-5", accent ? "glass-brand" : "glass", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-[11px] font-semibold uppercase tracking-[0.12em]", accent ? "opacity-80" : "text-ink-faint")}>{label}</p>
        {icon && (
          <span
            aria-hidden
            className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", accent ? "bg-black/15" : tone ? "text-[var(--tone)]" : "bg-raised text-ink-muted")}
            style={tone && !accent ? ({ "--tone": `var(--chart-${tone})`, background: "color-mix(in oklab, var(--tone) 20%, transparent)" } as CSSProperties) : undefined}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-3 text-4xl font-extrabold leading-none tracking-tight tabular-nums">
        {prefix && <span className={cn("mr-0.5 text-lg font-semibold", accent ? "opacity-80" : "text-ink-muted")}>{prefix}</span>}
        {counts ? (
          <>
            <span className="sr-only">{value}</span>
            <span aria-hidden className="count" style={{ "--to": Number(value) } as CSSProperties} />
          </>
        ) : (
          value
        )}
      </p>
      <p className={cn("mt-4 flex items-center gap-1.5 text-xs", accent ? "opacity-85" : "text-ink-faint")}>
        {delta ? (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold tabular-nums",
                delta.direction === "up" ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
                accent && "bg-black/20 text-inherit",
              )}
            >
              {delta.direction === "up" ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />}
              {delta.percent}%
            </span>
            <span>vs {delta.versus}</span>
          </>
        ) : (
          (note ?? "No data yet")
        )}
      </p>
    </div>
  );
}
