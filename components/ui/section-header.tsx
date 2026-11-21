import type { ReactNode } from "react";

/** Heading above a group of cards: title, optional one-line hint, optional controls on the right. */
export function SectionHeader({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
