import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Pure-CSS tooltip: shows on hover and on keyboard focus of whatever it wraps.
 * The wrapped control must have its own accessible name (the tooltip is decoration, aria-hidden).
 */
export function Tooltip({
  label,
  side = "right",
  children,
  className,
}: {
  label: string;
  side?: "right" | "top" | "bottom";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("group/tip relative inline-flex", className)}>
      {children}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-full border border-line-strong bg-canvas px-3 py-1.5 text-xs font-semibold text-ink opacity-0 shadow-lg shadow-black/40 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          side === "right" && "left-full top-1/2 ml-3 -translate-y-1/2",
          side === "top" && "bottom-full left-1/2 mb-2 -translate-x-1/2",
          side === "bottom" && "left-1/2 top-full mt-2 -translate-x-1/2",
        )}
      >
        {label}
      </span>
    </span>
  );
}
