"use client";

import { useState } from "react";
import { Button, cn } from "@/components/ui";
import { PaymentStatusBadge } from "@/components/ui/payment-status-badge";
import { formatMoney } from "@/lib/money";
import { PrintButtons } from "../print-buttons";
import { ErrorNote, Modal, type SentOrder } from "./dialogs";

const METHODS = [
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "online", label: "Online" },
  { key: "other", label: "Other" },
] as const;
type Method = (typeof METHODS)[number]["key"];
type PayState = { status: string; paid: number; balance: number };

const field =
  "min-h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm text-ink placeholder:text-ink-faint transition-colors duration-200 hover:border-line-strong";

/**
 * "Take payment" for a just-sent order. One payment at a time; if the customer
 * pays in parts, the form comes back for the rest. THE MONEY RULE: the amount
 * still owed, the paid amount and the status are always what the server
 * answered. This screen only sends what was handed over (method, amount).
 */
export function PaymentDialog({
  order,
  restaurantId,
  currency,
  onBack,
  onClose,
}: {
  order: SentOrder;
  restaurantId: string;
  currency: string;
  onBack: () => void;
  onClose: () => void;
}) {
  // `order.total` is the total the server saved when the order was created.
  const [state, setState] = useState<PayState>({ status: "unpaid", paid: 0, balance: order.total });
  const [method, setMethod] = useState<Method>("cash");
  const [amount, setAmount] = useState(order.total.toFixed(2));
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One fresh key per payment. A double click re-sends the SAME key, so the
  // server records it only once; a new key is made after each successful payment.
  const [key, setKey] = useState(() => crypto.randomUUID());

  async function pay() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/record-payment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          order_id: order.orderId,
          method,
          amount: Number(amount),
          reference: reference.trim() || null,
          idempotency_key: key,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setState({ status: json.payment_status, paid: json.paid_amount, balance: json.balance });
        setAmount(Number(json.balance).toFixed(2));
        setReference("");
        setKey(crypto.randomUUID());
      } else if (res.status === 401) {
        setError("You were logged out. Please log in again.");
      } else if (res.status === 400 && typeof json?.error === "string" && json.error.startsWith("payment is more")) {
        setError("That is more than the amount still owed.");
      } else if (res.status === 400) {
        setError("Check the amount and try again.");
      } else if (res.status === 409) {
        setError("This order cannot take a payment (already paid or cancelled).");
      } else {
        setError("Could not record the payment. Try again.");
      }
    } catch {
      setError("Network problem. Tap again; the same payment will not be taken twice.");
    } finally {
      setBusy(false);
    }
  }

  const paid = state.status === "paid";
  const valid = Number(amount) > 0;
  return (
    <Modal title={`Payment · ${order.orderNumber}`} onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="space-y-1.5 rounded-xl border border-line bg-raised p-3.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Order total</span>
            <span className="font-semibold tabular-nums">{formatMoney(order.total, currency)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Paid so far</span>
            <span className="font-semibold tabular-nums">{formatMoney(state.paid, currency)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-1.5">
            <span className="flex items-center gap-2 text-ink-muted">
              Still to pay <PaymentStatusBadge status={state.status} />
            </span>
            <span className="text-xl font-bold tabular-nums">{formatMoney(state.balance, currency)}</span>
          </div>
        </div>

        {paid ? (
          <p className="py-4 text-center text-sm text-ink-muted">This order is fully paid.</p>
        ) : (
          <>
            <div role="group" aria-label="Payment method" className="grid grid-cols-4 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={method === m.key}
                  onClick={() => setMethod(m.key)}
                  className={cn(
                    "min-h-11 rounded-xl border text-sm font-semibold transition-colors duration-200",
                    method === m.key ? "border-accent-line bg-accent-soft text-accent-ink" : "border-line bg-raised hover:border-line-strong",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                aria-label="Amount to take"
                className={cn(field, "text-base font-semibold tabular-nums")}
              />
              <Button onClick={() => setAmount(state.balance.toFixed(2))}>Full balance</Button>
            </div>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Reference (optional)"
              aria-label="Payment reference (optional)"
              maxLength={100}
              className={field}
            />
            <p className="text-xs text-ink-faint">Paying in parts? Take the first amount and the form comes back for the rest.</p>
          </>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <PrintButtons orderId={order.orderId} />
      </div>
      <div className="flex shrink-0 gap-3 border-t border-line px-5 py-4">
        {paid ? (
          <Button variant="primary" size="lg" className="flex-1" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button size="lg" onClick={state.paid > 0 ? onClose : onBack} disabled={busy}>
              {state.paid > 0 ? "Later" : "Back"}
            </Button>
            <Button variant="primary" size="lg" className="flex-1" onClick={pay} disabled={busy || !valid}>
              {busy ? "Saving..." : `Take ${valid ? formatMoney(Number(amount), currency) : "payment"}`}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
