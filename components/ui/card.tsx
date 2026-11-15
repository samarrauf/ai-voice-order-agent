import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/** The basic box everything sits in: dark surface, thin border, rounded corners. */
export function Card({ className, ...rest }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-line bg-surface p-5 transition-colors duration-200 hover:border-line-strong",
        className,
      )}
      {...rest}
    />
  );
}

/** Card heading: serif title on the left, optional small hint or control on the right. */
export function CardHeader({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      {action ?? (hint && <span className="text-xs text-ink-faint">{hint}</span>)}
    </div>
  );
}
