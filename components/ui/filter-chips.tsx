"use client";

import { cn } from "./cn";

export type Chip<K extends string = string> = { key: K; label: string; count?: number };

/**
 * A row of small rounded filter buttons (Today, Yesterday... or New, Preparing...).
 * The selected chip is outlined in the accent colour. On a narrow screen the
 * row scrolls sideways instead of wrapping.
 */
export function FilterChips<K extends string>({
  chips,
  value,
  onChange,
  disabled,
  label,
  className,
}: {
  chips: readonly Chip<K>[];
  value: K;
  onChange?: (key: K) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      {chips.map((chip) => {
        const active = chip.key === value;
        return (
          <button
            key={chip.key}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange?.(chip.key)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors duration-200 disabled:cursor-default",
              active
                ? "border-accent-line bg-accent-soft text-accent-ink"
                : "border-line bg-raised text-ink-muted enabled:hover:border-line-strong enabled:hover:text-ink",
            )}
          >
            {chip.label}
            {chip.count !== undefined && (
              <span
                className={cn(
                  "min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-bold tabular-nums",
                  active ? "bg-accent text-on-accent" : "bg-ink/10 text-ink-muted",
                )}
              >
                {chip.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
