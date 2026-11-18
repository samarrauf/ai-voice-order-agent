"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, CircleAlert, CircleCheck, Minus, Plus, Users, X } from "lucide-react";
import { Badge, Button, cn } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { PrintButtons } from "../print-buttons";
import { MAX_LINE_QTY, type CartTable, type NewLine } from "./cart-store";
import type { PosItem, PosTable } from "./pos-types";

// The POS popups: choose size + extras, choose (and seat) a table, and the
// "order sent" message. All three share the Modal frame below. On a phone a
// popup slides up from the bottom; on bigger screens it sits in the middle.

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  // Escape closes the popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-canvas/80 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="anim-rise relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line-strong bg-surface shadow-2xl shadow-canvas sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="min-w-0 truncate font-display text-xl font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors duration-200 hover:bg-ink/5 hover:text-ink"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A red one-line problem message. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/12 px-3 py-2.5 text-sm text-danger">
      <CircleAlert size={16} aria-hidden className="shrink-0" />
      {children}
    </p>
  );
}

/** Round − / + buttons with the number between them. */
export function Stepper({
  value,
  min = 1,
  max,
  onChange,
  label,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const btn =
    "inline-flex size-11 items-center justify-center rounded-full border border-line bg-raised transition-colors duration-200 enabled:hover:border-line-strong disabled:opacity-40";
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-2">
      <button type="button" aria-label={`Fewer: ${label}`} className={btn} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus size={16} aria-hidden />
      </button>
      <span className="w-8 text-center text-lg font-bold tabular-nums">{value}</span>
      <button type="button" aria-label={`More: ${label}`} className={btn} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus size={16} aria-hidden />
      </button>
    </div>
  );
}

const choice = (active: boolean) =>
  cn(
    "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3.5 text-left text-sm font-medium transition-colors duration-200 disabled:opacity-40",
    active ? "border-accent-line bg-accent-soft text-accent-ink" : "border-line bg-raised text-ink enabled:hover:border-line-strong",
  );

const groupLabel = "mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint";

/** Popup for an item that has sizes or extras: pick them, then it goes into the cart. */
export function ItemDialog({
  item,
  currency,
  onAdd,
  onClose,
}: {
  item: PosItem;
  currency: string;
  onAdd: (line: NewLine) => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState<string | null>((item.sizes.find((s) => s.isDefault) ?? item.sizes[0])?.name ?? null);
  const [picked, setPicked] = useState<Record<string, string[]>>({}); // group name -> chosen option names
  const [quantity, setQuantity] = useState(1);

  function toggle(group: string, maxSelect: number, name: string) {
    setPicked((prev) => {
      const current = prev[group] ?? [];
      if (current.includes(name)) return { ...prev, [group]: current.filter((n) => n !== name) };
      // "Pick one" groups swap the choice; bigger groups stop at their limit.
      if (maxSelect === 1) return { ...prev, [group]: [name] };
      if (current.length >= maxSelect) return prev;
      return { ...prev, [group]: [...current, name] };
    });
  }

  return (
    <Modal title={item.name} onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {item.sizes.length > 0 && (
          <div>
            <p className={groupLabel}>Size</p>
            <div className="grid grid-cols-2 gap-2">
              {item.sizes.map((s) => (
                <button key={s.name} type="button" aria-pressed={size === s.name} onClick={() => setSize(s.name)} className={choice(size === s.name)}>
                  <span>{s.name}</span>
                  <span className="tabular-nums text-ink-muted">{formatMoney(s.price, currency)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {item.optionGroups.map((g) => {
          const chosen = picked[g.name] ?? [];
          return (
            <div key={g.name}>
              <p className={groupLabel}>
                {g.name}
                <span className="ml-2 normal-case tracking-normal">{g.maxSelect === 1 ? "choose one" : `up to ${g.maxSelect}`}</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {g.options.map((o) => {
                  const active = chosen.includes(o.name);
                  return (
                    <button
                      key={o.name}
                      type="button"
                      aria-pressed={active}
                      disabled={!active && g.maxSelect > 1 && chosen.length >= g.maxSelect}
                      onClick={() => toggle(g.name, g.maxSelect, o.name)}
                      className={choice(active)}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {active && <Check size={14} aria-hidden className="shrink-0" />}
                        <span className="truncate">{o.name}</span>
                      </span>
                      {o.priceDelta !== 0 && (
                        <span className="shrink-0 tabular-nums text-ink-muted">+{formatMoney(o.priceDelta, currency)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-line px-5 py-4">
        <Stepper label="Quantity" value={quantity} max={MAX_LINE_QTY} onChange={setQuantity} />
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          onClick={() =>
            onAdd({
              menuItemId: item.id,
              name: item.name,
              sizeName: size,
              options: item.optionGroups.flatMap((g) => picked[g.name] ?? []),
              quantity,
            })
          }
        >
          Add to order
        </Button>
      </div>
    </Modal>
  );
}

/**
 * Popup listing every table. A busy table is picked as-is (the order joins the
 * party already sitting there). A free table first asks the party size and is
 * seated through /api/staff/seat-table, which owns the capacity and
 * double-seating rules.
 */
export function TableDialog({
  restaurantId,
  tables,
  selectedId,
  onPick,
  onChanged,
  onClose,
}: {
  restaurantId: string;
  tables: PosTable[];
  selectedId: string | null;
  onPick: (table: CartTable) => void;
  /** Called when the tables on screen may be out of date, so the page re-reads them. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const [seating, setSeating] = useState<PosTable | null>(null);
  const [party, setParty] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function seat(table: PosTable) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/seat-table", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurant_id: restaurantId, table_id: table.id, party_size: party }),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 201 && json?.session?.id) {
        onChanged();
        onPick({ tableId: table.id, tableNumber: table.number, sessionId: json.session.id });
        return;
      }
      if (res.status === 409) {
        onChanged();
        setSeating(null);
        setError(`Table ${table.number} was just taken. Pick it again to add to that party, or choose another.`);
      } else if (res.status === 401) {
        setError("You were logged out. Please log in again.");
      } else {
        setError("Could not seat the table. Try again.");
      }
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (seating) {
    return (
      <Modal title={`Seat table ${seating.number}`} onClose={onClose}>
        <div className="space-y-5 px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">How many people?</p>
              <p className="mt-0.5 text-xs text-ink-faint">This table seats {seating.seats}.</p>
            </div>
            <Stepper label="Party size" value={party} max={seating.seats} onChange={setParty} />
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
        <div className="flex shrink-0 gap-3 border-t border-line px-5 py-4">
          <Button size="lg" onClick={() => { setSeating(null); setError(null); }} disabled={busy}>
            Back
          </Button>
          <Button variant="primary" size="lg" className="flex-1" onClick={() => seat(seating)} disabled={busy}>
            {busy ? "Seating..." : "Seat and choose"}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Choose table" onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        {tables.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">This restaurant has no tables set up yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {tables.map((t) => {
              const occupied = t.sessionId !== null;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-pressed={selectedId === t.id}
                    onClick={() => {
                      setError(null);
                      if (occupied) onPick({ tableId: t.id, tableNumber: t.number, sessionId: t.sessionId! });
                      else {
                        setParty(Math.min(2, t.seats));
                        setSeating(t);
                      }
                    }}
                    className={cn(
                      "flex min-h-24 w-full flex-col items-start justify-between gap-2 rounded-2xl border p-3 text-left transition-colors duration-200",
                      selectedId === t.id ? "border-accent-line bg-accent-soft" : "border-line bg-raised hover:border-line-strong",
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-lg font-bold">{t.number}</span>
                      <span className="flex items-center gap-1 text-xs text-ink-faint">
                        <Users size={13} aria-hidden />
                        {occupied ? `${t.partySize}/${t.seats}` : t.seats}
                      </span>
                    </span>
                    <Badge tone={occupied ? "preparing" : "ready"} dot>
                      {occupied ? "Busy" : "Free"}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs leading-relaxed text-ink-faint">
          A free table asks for the party size and seats them. A busy table adds this order to the party already there.
        </p>
      </div>
    </Modal>
  );
}

export type SentOrder = { orderId: string; orderNumber: string; total: number; where: string };

/** The "order sent" message. The total shown is the one the server saved. */
export function SentDialog({
  order,
  currency,
  onClose,
  onTakePayment,
}: {
  order: SentOrder;
  currency: string;
  onClose: () => void;
  onTakePayment: () => void;
}) {
  return (
    <Modal title="Sent to kitchen" onClose={onClose}>
      <div className="flex flex-col items-center px-5 py-8 text-center">
        <span className="flex size-16 items-center justify-center rounded-full border border-status-ready/30 bg-status-ready/12 text-status-ready">
          <CircleCheck size={32} aria-hidden />
        </span>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Order number</p>
        <p className="mt-1 font-display text-5xl font-semibold tracking-tight tabular-nums">{order.orderNumber}</p>
        <p className="mt-3 text-sm text-ink-muted">
          {order.where} · <span className="font-semibold tabular-nums text-ink">{formatMoney(order.total, currency)}</span>
        </p>
      </div>
      <PrintButtons orderId={order.orderId} className="shrink-0 px-5 pb-3" />
      <div className="flex shrink-0 gap-3 border-t border-line px-5 py-4">
        <Link
          href="/dashboard"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-raised px-5 text-base font-semibold transition-colors duration-200 hover:border-line-strong"
        >
          View orders
        </Link>
        <Button size="lg" onClick={onClose}>
          New order
        </Button>
        <Button variant="primary" size="lg" className="flex-1" onClick={onTakePayment}>
          Take payment
        </Button>
      </div>
    </Modal>
  );
}
