import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "./cn";

type Delta = { percent: number; direction: "up" | "down"; versus: string };

/**
 * One headline number: small label, big bold figure, and underneath either an
 * up/down comparison ("12% vs yesterday") or a plain note.
 */
export function KpiCard({
  label,
  value,
  prefix,
  delta,
  note,
  className,
}: {
  label: string;
  value: string;
  prefix?: string;
  delta?: Delta;
  note?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface p-4 transition-colors duration-200 hover:border-line-strong",
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{label}</p>
      <p className="mt-2 text-3xl font-bold leading-none tabular-nums">
        {prefix && <span className="mr-0.5 text-base font-semibold text-ink-muted">{prefix}</span>}
        {value}
      </p>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-faint">
        {delta ? (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-1 font-semibold tabular-nums",
                delta.direction === "up" ? "text-status-ready" : "text-danger",
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
