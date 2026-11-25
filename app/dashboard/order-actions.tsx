"use client";

import { useState } from "react";
import { Button, cn } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { CANCEL_REASONS, REFUND_METHODS, REFUND_REASONS, VOID_REASONS, type RefundMethod } from "@/lib/order-adjust";
import { ErrorNote, Modal } from "./pos/dialogs";

// B4b dialogs on the Orders board: Cancel order (and Cancel and refund), Refund, Void item.
// THE MONEY RULE: this screen only sends the order/item id, the reason, the refund method
// and (for a part refund) the amount asked for. Every total comes back from the server,
// which works it out from the database. Each action carries a fresh idempotency key, so
// a double click never refunds twice.

const METHOD_LABEL: Record<RefundMethod, string> = { cash: "Cash", card: "Card", online: "Online", other: "Other" };

const field =
  "min-h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm text-ink placeholder:text-ink-faint transition-colors duration-200 hover:border-line-strong";

const chip = (on: boolean) =>
  cn(
    "min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors duration-200",
    on ? "border-brand-line bg-brand-tint text-brand-ink" : "border-line bg-raised hover:border-line-strong",
  );

/** Preset reasons as buttons, plus "Other" with a text box. Returns the chosen text ("" = none yet). */
function ReasonPicker({ presets, value, onChange }: { presets: readonly string[]; value: string; onChange: (v: string) => void }) {
  const [other, setOther] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Reason (required)</p>
      <div role="group" aria-label="Reason" className="flex flex-wrap gap-2">
        {presets.map((r) => (
          <button key={r} type="button" aria-pressed={!other && value === r} className={chip(!other && value === r)} onClick={() => { setOther(false); onChange(r); }}>
            {r}
          </button>
        ))}
        <button type="button" aria-pressed={other} className={chip(other)} onClick={() => { setOther(true); onChange(""); }}>
          Other
        </button>
      </div>
      {other && (
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={200}
          placeholder="Write the reason"
          aria-label="Reason"
          className={field}
        />
      )}
    </div>
  );
}

function MethodPicker({ value, onChange, label }: { value: RefundMethod; onChange: (m: RefundMethod) => void; label: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{label}</p>
      <div role="group" aria-label={label} className="grid grid-cols-4 gap-2">
        {REFUND_METHODS.map((m) => (
          <button key={m} type="button" aria-pressed={value === m} className={chip(value === m)} onClick={() => onChange(m)}>
            {METHOD_LABEL[m]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Sends one action; returns null on success or the message to show. */
async function send(url: string, body: Record<string, unknown>): Promise<{ error: string | null; json: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok && json?.success) return { error: null, json };
    if (res.status === 401) return { error: "You were logged out. Please log in again.", json };
    if (res.status === 403) return { error: "Only an owner or manager can do this.", json };
    return { error: typeof json?.error === "string" ? json.error : "Something went wrong. Try again.", json };
  } catch {
    return { error: "Network problem. Tap again; it will not be done twice.", json: null };
  }
}

const validReason = (r: string) => r.trim().length >= 3;

export type ActionOrder = { id: string; order_number: string; total: number; paid_amount: number };

/** Cancel an order. If money was taken, it becomes "Cancel and refund" with a refund method. */
export function CancelDialog({ order, currency, onClose, onDone }: { order: ActionOrder; currency: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<RefundMethod>("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const refund = order.paid_amount > 0;

  async function go() {
    if (busy || !validReason(reason)) return;
    setBusy(true);
    setError(null);
    const { error: e } = await send("/api/staff/cancel-order", {
      order_id: order.id,
      reason: reason.trim(),
      ...(refund ? { refund_method: method, idempotency_key: key } : {}),
    });
    setBusy(false);
    if (e) setError(e);
    else onDone();
  }

  return (
    <Modal title={`Cancel order · ${order.order_number}`} onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {refund ? (
          <p className="rounded-xl border border-danger/30 bg-danger/12 px-3.5 py-3 text-sm">
            {formatMoney(order.paid_amount, currency)} was paid on this order. Cancelling refunds all of it in the same step.
          </p>
        ) : (
          <p className="text-sm text-ink-muted">The order stays on the board as Cancelled. It cannot be opened or paid again.</p>
        )}
        <ReasonPicker presets={CANCEL_REASONS} value={reason} onChange={setReason} />
        {refund && <MethodPicker value={method} onChange={setMethod} label="Refund by" />}
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
      <div className="flex shrink-0 gap-3 border-t border-line px-5 py-4">
        <Button size="lg" onClick={onClose} disabled={busy}>
          Back
        </Button>
        <Button variant="primary" size="lg" className="flex-1" onClick={go} disabled={busy || !validReason(reason)}>
          {busy ? "Saving..." : refund ? `Cancel and refund ${formatMoney(order.paid_amount, currency)}` : "Cancel order"}
        </Button>
      </div>
    </Modal>
  );
}

/** Refund all or part of the net paid amount. */
export function RefundDialog({ order, currency, onClose, onDone }: { order: ActionOrder; currency: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<RefundMethod>("cash");
  const [amount, setAmount] = useState(order.paid_amount.toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const n = Number(amount);
  const valid = validReason(reason) && Number.isFinite(n) && n > 0 && n <= order.paid_amount;

  async function go() {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    const { error: e } = await send("/api/staff/refund", { order_id: order.id, method, amount: n, reason: reason.trim(), idempotency_key: key });
    setBusy(false);
    if (e) setError(e);
    else onDone();
  }

  return (
    <Modal title={`Refund · ${order.order_number}`} onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="flex items-center justify-between rounded-xl border border-line bg-raised p-3.5 text-sm">
          <span className="text-ink-muted">Paid (after earlier refunds)</span>
          <span className="font-semibold tabular-nums">{formatMoney(order.paid_amount, currency)}</span>
        </div>
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            aria-label="Amount to refund"
            className={cn(field, "text-base font-semibold tabular-nums")}
          />
          <Button onClick={() => setAmount(order.paid_amount.toFixed(2))}>All</Button>
        </div>
        {n > order.paid_amount && <ErrorNote>That is more than was paid.</ErrorNote>}
        <MethodPicker value={method} onChange={setMethod} label="Refund by" />
        <ReasonPicker presets={REFUND_REASONS} value={reason} onChange={setReason} />
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
      <div className="flex shrink-0 gap-3 border-t border-line px-5 py-4">
        <Button size="lg" onClick={onClose} disabled={busy}>
          Back
        </Button>
        <Button variant="primary" size="lg" className="flex-1" onClick={go} disabled={busy || !valid}>
          {busy ? "Saving..." : `Refund ${n > 0 ? formatMoney(n, currency) : ""}`}
        </Button>
      </div>
    </Modal>
  );
}

/** Void one line of an unpaid order. The server works out the new total. */
export function VoidDialog({
  order,
  item,
  onClose,
  onDone,
}: {
  order: ActionOrder;
  item: { id: string; name: string; quantity: number };
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (busy || !validReason(reason)) return;
    setBusy(true);
    setError(null);
    const { error: e } = await send("/api/staff/void-item", { order_id: order.id, item_id: item.id, reason: reason.trim() });
    setBusy(false);
    if (e) setError(e);
    else onDone();
  }

  return (
    <Modal title={`Void item · ${order.order_number}`} onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <p className="text-sm">
          <span className="font-semibold">
            {item.quantity}× {item.name}
          </span>{" "}
          comes off the bill. The total and any discount are worked out again. A reprinted kitchen ticket shows it as VOID.
        </p>
        <ReasonPicker presets={VOID_REASONS} value={reason} onChange={setReason} />
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
      <div className="flex shrink-0 gap-3 border-t border-line px-5 py-4">
        <Button size="lg" onClick={onClose} disabled={busy}>
          Back
        </Button>
        <Button variant="primary" size="lg" className="flex-1" onClick={go} disabled={busy || !validReason(reason)}>
          {busy ? "Saving..." : "Void item"}
        </Button>
      </div>
    </Modal>
  );
}
