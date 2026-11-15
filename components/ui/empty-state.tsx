import type { ReactNode } from "react";
import { cn } from "./cn";

/** Shown inside a card or page that has nothing yet: an icon, a short title and one line of explanation. */
export function EmptyState({
  icon,
  title,
  message,
  className,
}: {
  icon: ReactNode;
  title: string;
  message?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 py-10 text-center", className)}>
      <div className="mb-3 flex size-12 items-center justify-center rounded-full border border-line bg-raised text-ink-faint">
        {icon}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {message && <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-faint">{message}</p>}
    </div>
  );
}
