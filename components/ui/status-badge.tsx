import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "new" | "preparing" | "ready" | "done" | "danger" | "neutral" | "hot";

const TONE: Record<Tone, string> = {
  hot: "border-lead-hot/30 bg-lead-hot/12 text-lead-hot",
  new: "border-status-new/30 bg-status-new/12 text-status-new",
  preparing: "border-status-preparing/30 bg-status-preparing/12 text-status-preparing",
  ready: "border-status-ready/30 bg-status-ready/12 text-status-ready",
  done: "border-line bg-ink/5 text-ink-muted",
  danger: "border-danger/30 bg-danger/12 text-danger",
  neutral: "border-line bg-raised text-ink-muted",
};

/** Small rounded label. `tone` picks the colour; `dot` adds a status dot (pulsing if `live`). */
export function Badge({
  tone = "neutral",
  dot,
  live,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  live?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
        TONE[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full bg-current", live && "dot-pulse")} />}
      {children}
    </span>
  );
}

// Order status -> label and colour. "accepted" is shown as New, same as the tabs.
const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "new" },
  accepted: { label: "New", tone: "new" },
  preparing: { label: "Preparing", tone: "preparing" },
  ready: { label: "Ready", tone: "ready" },
  completed: { label: "Completed", tone: "done" },
  cancelled: { label: "Cancelled", tone: "danger" },
  // Booking statuses (dashboard Bookings tab).
  confirmed: { label: "Confirmed", tone: "new" },
  seated: { label: "Seated", tone: "ready" },
  no_show: { label: "No-show", tone: "hot" },
};

/**
 * The coloured status label on an order or booking: blue New / Confirmed, amber Preparing,
 * green Ready / Seated, grey Completed, red Cancelled, orange No-show.
 */
export function StatusBadge({ status }: { status: string }) {
  const s = ORDER_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return (
    <Badge tone={s.tone} dot live={status === "new" || status === "accepted"}>
      {s.label}
    </Badge>
  );
}
