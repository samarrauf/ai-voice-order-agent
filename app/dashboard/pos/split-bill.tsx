"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Printer } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { PaymentStatusBadge } from "@/components/ui/payment-status-badge";
import { formatMoney } from "@/lib/money";
import type { SplitSpec } from "@/lib/bill-split";
import { MAX_GUESTS } from "@/lib/bill-split";
import { ErrorNote } from "./dialogs";
import { FIELD, METHODS, type Method } from "./pay-methods";

// B4c: Split bill, inside the payment popup. Three ways: equal, by items, by
// typed amounts. THE MONEY RULE: every share, paid amount and balance shown here
// is what the server answered (/api/staff/split-bill). The screen only sends the
// split itself (who has what) and, for a guest's payment, the method and amount.

type Mode = SplitSpec["mode"];
type Item = { id: string; name: string; quantity: number; detail: string[]; line_total: number };
type Guest = {
  guest: number;
  label: string;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  service_charge: number;
  tax: number;
  rounding: number;
  total: number;
  paid: number;
  balance: number;
  items: { id: string; shared_with: number; amount: number }[];
};
type Summary = { total: number; paid_amount: number; payment_status: string; rounding_step: number; items: Item[] };
type PayState = { status: string; paid: number; balance: number };

const MODES: { key: Mode; label: string }[] = [
  { key: "equal", label: "Equal" },
  { key: "items", label: "By items" },
  { key: "amounts", label: "Amounts" },
];

const chip = (on: boolean) =>
  cn(
    "min-h-11 rounded-xl border text-sm font-semibold transition-colors duration-200",
    on ? "border-brand-line bg-brand-tint text-brand-ink" : "border-line bg-raised hover:border-line-strong",
  );

/** The split as the server expects it, or null while it is not complete enough to ask. */
function specFor(mode: Mode, guests: number, assign: Record<string, number[]>, amounts: string[]): SplitSpec | null {
  if (mode === "equal") return { mode, guests };
  if (mode === "items") {
    const clean: Record<string, number[]> = {};
    for (const [id, gs] of Object.entries(assign)) {
      const kept = gs.filter((g) => g <= guests);
      if (kept.length) clean[id] = kept;
    }
    return { mode, guests, assign: clean };
  }
  const list = amounts.slice(0, guests).map((a) => Math.round(Number(a) * 100));
  if (list.length < guests || list.some((p) => !Number.isFinite(p) || p <= 0)) return null;
  return { mode, amounts: list };
}

export function SplitBill({
  orderId,
  restaurantId,
  currency,
  onPayment,
  onBack,
  onClose,
}: {
  orderId: string;
  restaurantId: string;
  currency: string;
  /** The order's state after a guest paid (as the server answered). */
  onPayment: (s: PayState) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [mode, setMode] = useState<Mode>("equal");
  const [guests, setGuests] = useState(2);
  const [assign, setAssign] = useState<Record<string, number[]>>({});
  const [amounts, setAmounts] = useState<string[]>(() => Array(MAX_GUESTS).fill(""));
  const [result, setResult] = useState<{ guests: Guest[]; print_href: string } | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  // The guest being paid for, with a fresh idempotency key per payment.
  const [payFor, setPayFor] = useState<{ guest: number; method: Method; amount: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const spec = useMemo(() => specFor(mode, guests, assign, amounts), [mode, guests, assign, amounts]);
  const specKey = JSON.stringify(spec);

  // Ask the server for the order (once) and for the shares whenever the split changes.
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/staff/split-bill", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ restaurant_id: restaurantId, order_id: orderId, ...(spec ? { split: spec } : {}) }),
        });
        const json = await res.json().catch(() => null);
        if (!live) return;
        if (res.status === 401) return setSplitError("You were logged out. Please log in again.");
        if (json?.success) {
          setSummary(json);
          setResult(json.guests ? { guests: json.guests, print_href: json.print_href } : null);
          setSplitError(null);
        } else {
          setResult(null);
          setSplitError(typeof json?.error === "string" ? json.error : "Could not work out the split.");
        }
      } catch {
        if (live) setSplitError("Network problem. Change anything to try again.");
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // specKey stands for spec (an object made fresh on each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, orderId, restaurantId, refresh]);

  const money = (v: number) => formatMoney(v, currency);
  const toggle = (itemId: string, g: number) =>
    setAssign((a) => {
      const now = a[itemId] ?? [];
      return { ...a, [itemId]: now.includes(g) ? now.filter((x) => x !== g) : [...now, g].sort((x, y) => x - y) };
    });

  async function pay() {
    if (!payFor || busy || !spec) return;
    setBusy(true);
    setPayError(null);
    try {
      const res = await fetch("/api/staff/record-payment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          order_id: orderId,
          method: payFor.method,
          amount: Number(payFor.amount),
          idempotency_key: payFor.key,
          split: spec,
          guest: payFor.guest,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        onPayment({ status: json.payment_status, paid: json.paid_amount, balance: json.balance });
        setPayFor(null);
        setRefresh((n) => n + 1);
      } else if (res.status === 401) {
        setPayError("You were logged out. Please log in again.");
      } else {
        setPayError(typeof json?.error === "string" ? json.error : "Could not record the payment. Try again.");
      }
    } catch {
      setPayError("Network problem. Tap again; the same payment will not be taken twice.");
    } finally {
      setBusy(false);
    }
  }

  const typedPence = amounts.slice(0, guests).reduce((s, a) => s + (Math.round(Number(a) * 100) || 0), 0);
  const leftPence = summary ? Math.round(summary.total * 100) - typedPence : 0;

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="flex items-center justify-between rounded-xl border border-line bg-raised p-3.5 text-sm">
          <span className="text-ink-muted">Order total</span>
          <span className="font-semibold tabular-nums">{summary ? money(summary.total) : "..."}</span>
        </div>

        <div role="group" aria-label="How to split" className="grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button key={m.key} type="button" aria-pressed={mode === m.key} onClick={() => setMode(m.key)} className={chip(mode === m.key)}>
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">Guests</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="One guest less"
              onClick={() => setGuests((g) => Math.max(2, g - 1))}
              className="inline-flex size-11 items-center justify-center rounded-xl border border-line bg-raised"
            >
              <Minus size={16} aria-hidden />
            </button>
            <span className="w-8 text-center text-lg font-bold tabular-nums">{guests}</span>
            <button
              type="button"
              aria-label="One guest more"
              onClick={() => setGuests((g) => Math.min(MAX_GUESTS, g + 1))}
              className="inline-flex size-11 items-center justify-center rounded-xl border border-line bg-raised"
            >
              <Plus size={16} aria-hidden />
            </button>
          </div>
        </div>

        {mode === "items" && summary && (
          <ul className="space-y-2">
            {summary.items.map((it) => (
              <li key={it.id} className="rounded-xl border border-line bg-raised p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="min-w-0">
                    {it.quantity}x {it.name}
                    {it.detail.length > 0 && <span className="block text-xs text-ink-faint">{it.detail.join(", ")}</span>}
                  </span>
                  <span className="tabular-nums">{money(it.line_total)}</span>
                </div>
                <div role="group" aria-label={`Who has ${it.name}`} className="mt-2 flex flex-wrap gap-1.5">
                  {Array.from({ length: guests }, (_, i) => i + 1).map((g) => {
                    const on = (assign[it.id] ?? []).includes(g);
                    return (
                      <button key={g} type="button" aria-pressed={on} onClick={() => toggle(it.id, g)} className={cn(chip(on), "min-w-11 px-2")}>
                        G{g}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
            <p className="text-xs text-ink-faint">Tap more than one guest to share an item between them.</p>
          </ul>
        )}

        {mode === "amounts" && (
          <div className="space-y-2">
            {Array.from({ length: guests }, (_, i) => (
              <label key={i} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 text-ink-muted">Guest {i + 1}</span>
                <input
                  value={amounts[i]}
                  onChange={(e) => setAmounts((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label={`Amount for guest ${i + 1}`}
                  className={cn(FIELD, "font-semibold tabular-nums")}
                />
              </label>
            ))}
            {summary && (
              <p className="text-xs text-ink-faint">
                {leftPence === 0 ? "Adds up to the total." : leftPence > 0 ? `Still to share: ${money(leftPence / 100)}` : `Over the total by ${money(-leftPence / 100)}`}
              </p>
            )}
          </div>
        )}

        {splitError && <ErrorNote>{splitError}</ErrorNote>}

        {result && (
          <ul className="space-y-2">
            {result.guests.map((g) => {
              const status = g.balance === 0 ? "paid" : g.paid > 0 ? "partial" : "unpaid";
              const open = payFor?.guest === g.guest;
              return (
                <li key={g.guest} className="rounded-xl border border-line bg-raised p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-semibold">
                      {g.label} <PaymentStatusBadge status={status} />
                    </span>
                    <span className="text-base font-bold tabular-nums">{money(g.total)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-ink-muted">
                    <span>
                      {g.items.length > 0 ? `${g.items.length} item${g.items.length === 1 ? "" : "s"} · ` : ""}
                      Paid {money(g.paid)}
                    </span>
                    <span>Due {money(g.balance)}</span>
                  </div>
                  {g.balance > 0 && !open && (
                    <Button
                      className="mt-2 w-full"
                      onClick={() => {
                        setPayError(null);
                        setPayFor({ guest: g.guest, method: "cash", amount: g.balance.toFixed(2), key: crypto.randomUUID() });
                      }}
                    >
                      Take {money(g.balance)}
                    </Button>
                  )}
                  {open && payFor && (
                    <div className="mt-2 space-y-2">
                      <div role="group" aria-label="Payment method" className="grid grid-cols-4 gap-1.5">
                        {METHODS.map((m) => (
                          <button
                            key={m.key}
                            type="button"
                            aria-pressed={payFor.method === m.key}
                            onClick={() => setPayFor({ ...payFor, method: m.key })}
                            className={chip(payFor.method === m.key)}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                      <input
                        value={payFor.amount}
                        onChange={(e) => setPayFor({ ...payFor, amount: e.target.value })}
                        inputMode="decimal"
                        aria-label={`Amount from ${g.label}`}
                        className={cn(FIELD, "font-semibold tabular-nums")}
                      />
                      {payError && <ErrorNote>{payError}</ErrorNote>}
                      <div className="flex gap-2">
                        <Button onClick={() => setPayFor(null)} disabled={busy}>
                          Cancel
                        </Button>
                        <Button variant="primary" className="flex-1" onClick={pay} disabled={busy || !(Number(payFor.amount) > 0)}>
                          {busy ? "Saving..." : `Take ${Number(payFor.amount) > 0 ? money(Number(payFor.amount)) : "payment"}`}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {result && (
          <a
            href={result.print_href}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-raised px-3 text-sm font-semibold transition duration-200 hover:border-line-strong"
          >
            <Printer size={16} aria-hidden />
            Print split bills
          </a>
        )}
      </div>
      <div className="flex shrink-0 gap-3 border-t border-line px-5 py-4">
        <Button size="lg" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button variant="primary" size="lg" className="flex-1" onClick={onClose} disabled={busy}>
          Done
        </Button>
      </div>
    </>
  );
}
