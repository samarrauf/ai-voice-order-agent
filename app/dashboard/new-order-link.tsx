import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/components/ui";

/**
 * The "+ New Order" button: opens the POS screen (/dashboard/pos).
 * Used in the dashboard header and on the Orders page. `compact` (the header)
 * shrinks to just the + on screens where there is no room for the words.
 */
export function NewOrderLink({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      href="/dashboard/pos"
      aria-label="New order"
      className={cn(
        "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-brand px-3 text-sm font-semibold text-on-brand shadow-[0_0_18px_-4px_var(--color-brand)] transition duration-200 hover:brightness-110 active:scale-[0.98]",
        !compact && "px-5",
        className,
      )}
    >
      <Plus size={18} aria-hidden />
      <span className={cn(compact && "hidden sm:inline lg:hidden 2xl:inline")}>New Order</span>
    </Link>
  );
}
