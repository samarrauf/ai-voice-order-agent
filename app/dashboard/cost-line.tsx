import { formatMoney } from "@/lib/money";
import type { LineCost } from "@/lib/profit";
import { cn } from "@/components/ui";

// The small owner-only line under a sold item: "Cost Rs 400 · Profit Rs 850".
// It only renders what the server sent; the server sends cost data to view_profit only.
// Never used on the bill, the kitchen ticket, the website or the voice agent.

export function CostLine({ cost, currency, className }: { cost: LineCost; currency: string; className?: string }) {
  if (cost.line_cost === null || cost.profit === null) {
    return <p className={cn("mt-1 text-[11px] leading-snug text-ink-faint", className)}>Cost not set</p>;
  }
  return (
    <p className={cn("mt-1 text-[11px] leading-snug tabular-nums text-ink-faint", className)}>
      Cost {formatMoney(cost.line_cost, currency)} · Profit{" "}
      <span className={cost.profit < 0 ? "font-semibold text-danger" : undefined}>{formatMoney(cost.profit, currency)}</span>
    </p>
  );
}
