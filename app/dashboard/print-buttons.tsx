import { Printer, ReceiptText } from "lucide-react";
import { printBillHref, printKotAdditionHref, printKotHref } from "@/lib/print-links";
import { cn } from "@/components/ui";

// Two small buttons that open the print pages in a NEW tab.
const LINK =
  "inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-line bg-raised px-3 text-sm font-semibold transition duration-200 hover:border-line-strong active:scale-[0.98]";

/** `kotEventId` (an items_added event): the KOT button prints only those new items, headed ADDITION. */
export function PrintButtons({ orderId, className, kotEventId }: { orderId: string; className?: string; kotEventId?: string | null }) {
  return (
    <div className={cn("flex gap-2", className)}>
      <a href={printBillHref(orderId)} target="_blank" rel="noopener" className={LINK}>
        <Printer size={16} aria-hidden />
        Print Bill
      </a>
      <a href={kotEventId ? printKotAdditionHref(orderId, kotEventId) : printKotHref(orderId)} target="_blank" rel="noopener" className={LINK}>
        <ReceiptText size={16} aria-hidden />
        {kotEventId ? "Print KOT (new items)" : "Print KOT"}
      </a>
    </div>
  );
}
