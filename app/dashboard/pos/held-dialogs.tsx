"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { HeldCart } from "@/lib/held-carts";
import { ErrorNote, Modal } from "./dialogs";

// Hold / resume: put the current cart aside and take it back later. All calls go to
// /api/staff/held-carts; prices are always checked again by the server on resume.

const input =
  "min-h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm text-ink placeholder:text-ink-faint transition-colors duration-200 hover:border-line-strong";

type HeldRow = { id: string; label: string; created_at: string; item_count: number; order_type: string | null; table_number: string | null; mine: boolean };

export type ResumeResult = {
  cart: HeldCart;
  removed: { name: string; reason: string }[];
  price_changes: { name: string; old_unit_price: number; new_unit_price: number }[];
  old_total: number | null;
  new_total: number | null;
  total_changed: boolean;
  notes: string[];
};

async function call<T>(body: unknown): Promise<{ ok: true; json: T } | { ok: false; message: string }> {
  try {
    const res = await fetch("/api/staff/held-carts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success) return { ok: true, json: json as T };
    if (res.status === 401) return { ok: false, message: "You were logged out. Please log in again." };
    if (res.status === 403) return { ok: false, message: "You do not have permission to do this." };
    return { ok: false, message: typeof json?.error === "string" ? json.error : "Something went wrong. Try again." };
  } catch {
    return { ok: false, message: "Network problem. Try again." };
  }
}

/** How many orders are on hold (for the badge on the Held button). */
export async function countHeld(): Promise<number | null> {
  const r = await call<{ held: HeldRow[] }>({ action: "list" });
  return r.ok ? r.json.held.length : null;
}

export function HoldDialog({ cart, onHeld, onClose }: { cart: HeldCart; onHeld: () => void; onClose: () => void }) {
  const [label, setLabel] = useState(cart.table ? `Table ${cart.table.tableNumber}` : cart.customerName.trim());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function hold() {
    setBusy(true);
    setError(null);
    const r = await call({ action: "hold", label: label.trim(), cart });
    setBusy(false);
    if (r.ok) onHeld();
    else setError(r.message);
  }

  return (
    <Modal title="Hold this order" onClose={onClose}>
      <div className="space-y-3 p-5">
        <label className="block text-sm text-ink-muted" htmlFor="hold-label">
          Name or table (so you can find it again)
        </label>
        <input id="hold-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} autoFocus placeholder="e.g. Ali, or Table 4" className={input} />
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex gap-2">
          <Button variant="primary" size="lg" className="flex-1" disabled={busy || !label.trim()} onClick={hold}>
            {busy ? "Holding..." : "Hold order"}
          </Button>
          <Button size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function HeldListDialog({
  currency,
  cartHasItems,
  onResume,
  onClose,
}: {
  currency: string;
  cartHasItems: boolean;
  onResume: (result: ResumeResult) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<HeldRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResumeResult | null>(null);

  const load = useCallback(async () => {
    const r = await call<{ held: HeldRow[] }>({ action: "list" });
    if (r.ok) setRows(r.json.held);
    else setError(r.message);
  }, []);
  useEffect(() => {
    let live = true;
    void call<{ held: HeldRow[] }>({ action: "list" }).then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.json.held);
      else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, []);

  async function resume(id: string) {
    setBusyId(id);
    setError(null);
    const r = await call<ResumeResult>({ action: "resume", id });
    setBusyId(null);
    if (!r.ok) {
      setError(r.message);
      void load();
      return;
    }
    const differs = r.json.removed.length > 0 || r.json.price_changes.length > 0 || r.json.total_changed || r.json.notes.length > 0;
    if (differs) setResult(r.json);
    else onResume(r.json);
  }

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    const r = await call({ action: "delete", id });
    setBusyId(null);
    if (!r.ok) setError(r.message);
    void load();
  }

  // After a resume whose prices or items changed: show the difference before the cart is replaced.
  if (result) {
    return (
      <Modal title="Prices have changed" onClose={() => onResume(result)}>
        <div className="space-y-3 p-5 text-sm">
          {result.price_changes.map((c) => (
            <p key={c.name}>
              {c.name}: {formatMoney(c.old_unit_price, currency)} is now <strong>{formatMoney(c.new_unit_price, currency)}</strong>
            </p>
          ))}
          {result.removed.map((r) => (
            <p key={r.name} className="text-danger">
              {r.name} was removed: it is not available any more.
            </p>
          ))}
          {result.notes.map((n) => (
            <p key={n} className="text-danger">
              {n}
            </p>
          ))}
          {result.total_changed && result.old_total !== null && result.new_total !== null && (
            <p className="font-semibold">
              Total was {formatMoney(result.old_total, currency)}, now {formatMoney(result.new_total, currency)}.
            </p>
          )}
          <Button variant="primary" size="lg" className="w-full" onClick={() => onResume(result)}>
            OK, continue with this order
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Held orders" onClose={onClose}>
      <div className="space-y-3 overflow-y-auto p-5">
        {cartHasItems && <p className="text-xs text-ink-muted">Resuming replaces the order you are building now. Hold it first if you want to keep it.</p>}
        {error && <ErrorNote>{error}</ErrorNote>}
        {rows === null && !error && <p className="text-sm text-ink-muted">Loading...</p>}
        {rows?.length === 0 && <p className="text-sm text-ink-muted">No held orders.</p>}
        <ul className="space-y-2">
          {rows?.map((h) => (
            <li key={h.id} className="flex items-center gap-2 rounded-xl border border-line bg-raised p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{h.label}</p>
                <p className="text-xs text-ink-muted">
                  {h.item_count} {h.item_count === 1 ? "item" : "items"}
                  {h.table_number ? ` · Table ${h.table_number}` : ""} · {new Date(h.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <Button variant="primary" disabled={busyId !== null} onClick={() => resume(h.id)}>
                Resume
              </Button>
              <Button variant="ghost" disabled={busyId !== null} onClick={() => remove(h.id)} aria-label={`Delete held order ${h.label}`}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
