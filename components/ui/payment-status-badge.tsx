import { Badge } from "./status-badge";

// Payment status -> label and colour: red Unpaid, amber Partial, green Paid.
const PAYMENT: Record<string, { label: string; tone: "danger" | "preparing" | "ready" | "done" }> = {
  unpaid: { label: "Unpaid", tone: "danger" },
  partial: { label: "Partial", tone: "preparing" },
  paid: { label: "Paid", tone: "ready" },
  // B4b: money given back.
  refunded: { label: "Refunded", tone: "done" },
  partially_refunded: { label: "Part refunded", tone: "preparing" },
};

/** The small payment label on an order: Unpaid / Partial / Paid / Refunded / Part refunded. */
export function PaymentStatusBadge({ status }: { status: string }) {
  const s = PAYMENT[status] ?? PAYMENT.unpaid;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
