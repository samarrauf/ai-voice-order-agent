import { Printer, ReceiptText } from "lucide-react";
import { printBillHref, printKotHref } from "@/lib/print-links";
import { cn } from "@/components/ui";

// Two small buttons that open the print pages in a NEW tab.
const LINK =
  "inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-line bg-raised px-3 text-sm font-semibold transition duration-200 hover:border-line-strong active:scale-[0.98]";

export function PrintButtons({ orderId, className }: { orderId: string; className?: string }) {
  return (
    <div className={cn("flex gap-2", className)}>
      <a href={printBillHref(orderId)} target="_blank" rel="noopener" className={LINK}>
        <Printer size={16} aria-hidden />
        Print Bill
      </a>
      <a href={printKotHref(orderId)} target="_blank" rel="noopener" className={LINK}>
        <ReceiptText size={16} aria-hidden />
        Print KOT
      </a>
    </div>
  );
}
