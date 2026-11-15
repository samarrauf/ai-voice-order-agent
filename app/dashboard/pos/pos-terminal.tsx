"use client";

import { useEffect, useMemo, useReducer, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Armchair, ChevronUp, Plus, Search, SearchX, Send, ShoppingBag, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Button, Card, EmptyState, FilterChips, Skeleton, cn } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import {
  MAX_LINE_QTY,
  cartReducer,
  emptyCart,
  itemCount,
  toItemsPayload,
  toOrderPayload,
  type CartAction,
  type CartState,
  type OrderType,
} from "./cart-store";
import { ErrorNote, ItemDialog, Modal, SentDialog, Stepper, TableDialog, type SentOrder } from "./dialogs";
import type { PosCategory, PosItem, PosTable } from "./pos-types";

// The POS screen. Left: search, category chips and the item tiles. Right: the
// cart (on a phone it is a sheet that slides up from the bottom).
//
// THE MONEY RULE: this file never adds up prices. Whenever the cart's items
// change it asks /api/staff/price-preview and shows that answer (`quote`).
// While the answer is on its way the prices show as grey placeholders and
// "Send to Kitchen" is switched off.

const ORDER_TYPES: readonly { key: OrderType; label: string }[] = [
  { key: "dine_in", label: "Dine-in" },
  { key: "takeaway", label: "Takeaway" },
];

// Soft tile tints, one per category in turn. Design-system colours only.
const TINTS = [
  "var(--color-accent)",
  "var(--color-status-new)",
  "var(--color-status-preparing)",
  "var(--color-status-ready)",
  "var(--color-lead-hot)",
  "var(--color-secondary)",
];

type Quote =
  | { sig: string; ok: true; lines: { unit_price: number; line_total: number }[]; total: number }
  | { sig: string; ok: false; error: string };

const input =
  "min-h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm text-ink placeholder:text-ink-faint transition-colors duration-200 hover:border-line-strong";
const label = "text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint";

export function PosTerminal({
  restaurantId,
  currency,
  categories,
  tables,
}: {
  restaurantId: string;
  currency: string;
  categories: PosCategory[];
  tables: PosTable[];
}) {
  const router = useRouter();
  const [cart, dispatch] = useReducer(cartReducer, undefined, () => emptyCart());

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [configuring, setConfiguring] = useState<PosItem | null>(null);
  const [choosingTable, setChoosingTable] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentOrder | null>(null);

  // ---- Prices: always from the server ---------------------------------
  const sig = JSON.stringify(toItemsPayload(cart.lines));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (sig === "[]") return;
    const ctrl = new AbortController();
    // A short pause so several quick taps become one request.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/staff/price-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ restaurant_id: restaurantId, items: JSON.parse(sig) }),
          signal: ctrl.signal,
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success) setQuote({ sig, ok: true, lines: json.lines, total: json.total });
        else if (res.status === 401) setQuote({ sig, ok: false, error: "You were logged out. Please log in again." });
        else setQuote({ sig, ok: false, error: "Could not price this order. An item may have just changed on the menu." });
      } catch {
        if (!ctrl.signal.aborted) setQuote({ sig, ok: false, error: "Network problem. Could not get the prices." });
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [sig, restaurantId, retry]);
  // Only an answer for exactly the items now in the cart counts.
  const current = quote?.sig === sig ? quote : null;
  const priced = current?.ok ? current : null;

  // ---- Menu filtering ---------------------------------------------------
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .map((c, index) => ({ ...c, tint: TINTS[index % TINTS.length] }))
      .filter((c) => category === "all" || c.id === category)
      .map((c) => ({ ...c, items: q ? c.items.filter((i) => i.search.includes(q)) : c.items }))
      .filter((c) => c.items.length > 0);
  }, [categories, category, query]);

  function tapItem(item: PosItem) {
    if (item.sizes.length > 0 || item.optionGroups.length > 0) setConfiguring(item);
    else dispatch({ type: "add", line: { menuItemId: item.id, name: item.name, sizeName: null, options: [], quantity: 1 } });
  }

  // ---- Sending the order ------------------------------------------------
  const needsTable = cart.orderType === "dine_in" && !cart.table;
  const canSend = cart.lines.length > 0 && !!priced && !needsTable && !sending;

  async function send() {
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/staff/manual-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toOrderPayload(restaurantId, cart)),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 201 && json?.success) {
        setSent({
          orderNumber: json.order_number,
          total: json.total,
          where: cart.orderType === "dine_in" ? `Table ${cart.table?.tableNumber}` : "Takeaway",
        });
        dispatch({ type: "reset" });
        setSheetOpen(false);
        router.refresh();
      } else if (res.status === 401) {
        setSendError("You were logged out. Please log in again.");
      } else if (res.status === 409 || res.status === 404) {
        // The table was cleared in the meantime.
        dispatch({ type: "setTable", table: null });
        router.refresh();
        setSendError("That table is no longer seated. Choose the table again.");
      } else {
        setSendError("Could not send the order. Try again.");
      }
    } catch {
      setSendError("Network problem. The order was not sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  const count = itemCount(cart.lines);
  const cartPanel = (
    <CartPanel
      cart={cart}
      dispatch={dispatch}
      currency={currency}
      priced={priced}
      priceError={current && !current.ok ? current.error : null}
      onRetryPrice={() => setRetry((n) => n + 1)}
      onChooseTable={() => {
        router.refresh(); // show the latest free/busy state
        setChoosingTable(true);
      }}
      needsTable={needsTable}
      canSend={canSend}
      sending={sending}
      sendError={sendError}
      onSend={send}
    />
  );

  return (
    // No entrance animation on this wrapper: an animated box would trap the
    // popups and the phone bar (position: fixed) inside itself.
    <div className="pb-20 md:grid md:grid-cols-[minmax(0,1fr)_340px] md:items-start md:gap-5 md:pb-0 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* ---------------- Left: the menu ---------------- */}
      <div className="anim-rise min-w-0">
        <h1 className="mb-4 font-display text-3xl font-semibold tracking-tight">New order</h1>

        <div className="relative">
          <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the menu"
            aria-label="Search the menu"
            className={cn(input, "min-h-12 pl-10 pr-11 text-base [&::-webkit-search-cancel-button]:hidden")}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-0.5 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint hover:text-ink"
            >
              <X size={18} aria-hidden />
            </button>
          )}
        </div>

        <FilterChips
          label="Menu category"
          chips={[{ key: "all", label: "All" }, ...categories.map((c) => ({ key: c.id, label: c.name }))]}
          value={category}
          onChange={setCategory}
          className="mt-3"
        />

        {visible.length === 0 ? (
          <Card className="mt-5">
            <EmptyState
              className="min-h-56"
              icon={<SearchX size={20} />}
              title={categories.length === 0 ? "The menu is empty" : "Nothing found"}
              message={categories.length === 0 ? "Add items on the Menu page first." : "Try a different word or another category."}
            />
          </Card>
        ) : (
          visible.map((c) => (
            <section key={c.id} className="mt-5" style={{ "--tile": c.tint } as CSSProperties}>
              <h2 className={cn(label, "mb-2.5")}>{c.name}</h2>
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {c.items.map((item) => {
                  const hasChoices = item.sizes.length > 0 || item.optionGroups.length > 0;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={!item.available}
                        onClick={() => tapItem(item)}
                        className="pos-tile flex min-h-24 w-full flex-col justify-between gap-3 rounded-2xl border p-3.5 text-left transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100"
                      >
                        <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{item.name}</span>
                        <span className="flex w-full items-end justify-between gap-2">
                          <span className="text-sm tabular-nums text-ink-muted">
                            {!item.available ? (
                              "Unavailable"
                            ) : (
                              <>
                                {item.sizes.length > 1 && <span className="mr-1 text-ink-faint">from</span>}
                                <span className="font-bold text-ink">
                                  {formatMoney(item.sizes.length > 1 ? Math.min(...item.sizes.map((s) => s.price)) : item.price, currency)}
                                </span>
                              </>
                            )}
                          </span>
                          {item.available && (
                            <span className="pos-tile-icon flex size-7 shrink-0 items-center justify-center rounded-full">
                              {hasChoices ? <SlidersHorizontal size={14} aria-hidden /> : <Plus size={16} aria-hidden />}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {/* ---------------- Right: the cart (tablet and desktop) ---------------- */}
      <aside
        aria-label="Current order"
        className="sticky top-20 hidden max-h-[calc(100dvh-10.5rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface md:flex lg:top-24 lg:max-h-[calc(100dvh-7.5rem)]"
      >
        {cartPanel}
      </aside>

      {/* ---------------- Phone: a bar that opens the cart sheet ---------------- */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-canvas/90 px-4 py-2.5 backdrop-blur-md md:hidden">
        <Button variant="primary" size="lg" className="w-full justify-between!" onClick={() => setSheetOpen(true)}>
          <span className="flex items-center gap-2">
            <ShoppingBag size={18} aria-hidden />
            {count === 0 ? "Order is empty" : `${count} ${count === 1 ? "item" : "items"}`}
          </span>
          <span className="flex items-center gap-2 tabular-nums">
            {count > 0 && (priced ? formatMoney(priced.total, currency) : "...")}
            <ChevronUp size={18} aria-hidden />
          </span>
        </Button>
      </div>
      {sheetOpen && (
        <Modal title="Current order" onClose={() => setSheetOpen(false)}>
          {cartPanel}
        </Modal>
      )}

      {/* ---------------- Popups ---------------- */}
      {configuring && (
        <ItemDialog
          key={configuring.id}
          item={configuring}
          currency={currency}
          onClose={() => setConfiguring(null)}
          onAdd={(line) => {
            dispatch({ type: "add", line });
            setConfiguring(null);
          }}
        />
      )}
      {choosingTable && (
        <TableDialog
          restaurantId={restaurantId}
          tables={tables}
          selectedId={cart.table?.tableId ?? null}
          onChanged={() => router.refresh()}
          onClose={() => setChoosingTable(false)}
          onPick={(table) => {
            dispatch({ type: "setTable", table });
            setSendError(null);
            setChoosingTable(false);
          }}
        />
      )}
      {sent && <SentDialog order={sent} currency={currency} onClose={() => setSent(null)} />}
    </div>
  );
}

/** Everything in the cart. Used twice: the right-hand column and the phone sheet. */
function CartPanel({
  cart,
  dispatch,
  currency,
  priced,
  priceError,
  onRetryPrice,
  onChooseTable,
  needsTable,
  canSend,
  sending,
  sendError,
  onSend,
}: {
  cart: CartState;
  dispatch: (action: CartAction) => void;
  currency: string;
  priced: Extract<Quote, { ok: true }> | null;
  priceError: string | null;
  onRetryPrice: () => void;
  onChooseTable: () => void;
  needsTable: boolean;
  canSend: boolean;
  sending: boolean;
  sendError: string | null;
  onSend: () => void;
}) {
  const empty = cart.lines.length === 0;
  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <FilterChips
          label="Order type"
          chips={ORDER_TYPES}
          value={cart.orderType}
          onChange={(orderType) => dispatch({ type: "setOrderType", orderType })}
        />

        {cart.orderType === "dine_in" && (
          <button
            type="button"
            onClick={onChooseTable}
            className={cn(
              "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3.5 text-sm font-semibold transition-colors duration-200",
              cart.table ? "border-accent-line bg-accent-soft text-accent-ink" : "border-dashed border-line-strong bg-raised text-ink hover:border-accent-line",
            )}
          >
            <span className="flex items-center gap-2">
              <Armchair size={17} aria-hidden />
              {cart.table ? `Table ${cart.table.tableNumber}` : "Choose table"}
            </span>
            <span className="text-xs font-medium text-ink-faint">{cart.table ? "Change" : "Required"}</span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <input
            value={cart.customerName}
            onChange={(e) => dispatch({ type: "setField", field: "customerName", value: e.target.value })}
            placeholder="Name (optional)"
            aria-label="Customer name (optional)"
            maxLength={80}
            autoComplete="off"
            className={input}
          />
          <input
            value={cart.customerPhone}
            onChange={(e) => dispatch({ type: "setField", field: "customerPhone", value: e.target.value })}
            placeholder="Phone (optional)"
            aria-label="Customer phone (optional)"
            type="tel"
            maxLength={30}
            autoComplete="off"
            className={input}
          />
        </div>

        {empty ? (
          <EmptyState icon={<ShoppingBag size={20} />} title="No items yet" message="Tap an item on the menu to add it to this order." />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {cart.lines.map((line, index) => (
              <li key={line.key} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">{line.name}</p>
                    {(line.sizeName || line.options.length > 0) && (
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">
                        {[line.sizeName, ...line.options].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {priced ? (
                    <span className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(priced.lines[index].line_total, currency)}</span>
                  ) : (
                    <Skeleton className="h-5 w-12 shrink-0" />
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <Stepper
                    label={`Quantity of ${line.name}`}
                    value={line.quantity}
                    max={MAX_LINE_QTY}
                    onChange={(quantity) => dispatch({ type: "setQuantity", key: line.key, quantity })}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${line.name}`}
                    onClick={() => dispatch({ type: "remove", key: line.key })}
                    className="inline-flex size-11 items-center justify-center rounded-full text-ink-faint transition-colors duration-200 hover:bg-danger/12 hover:text-danger"
                  >
                    <Trash2 size={17} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <textarea
          value={cart.note}
          onChange={(e) => dispatch({ type: "setField", field: "note", value: e.target.value })}
          placeholder="Note for the whole order (e.g. less spicy)"
          aria-label="Note for the whole order"
          maxLength={300}
          rows={2}
          className={cn(input, "resize-none py-2.5")}
        />
      </div>

      <div className="shrink-0 space-y-3 border-t border-line p-4">
        {priceError && !empty && (
          <ErrorNote>
            <span className="flex-1">{priceError}</span>
            <button type="button" onClick={onRetryPrice} className="shrink-0 font-semibold underline underline-offset-2">
              Retry
            </button>
          </ErrorNote>
        )}
        {sendError && <ErrorNote>{sendError}</ErrorNote>}
        <div className="flex items-baseline justify-between">
          <span className={label}>Total</span>
          {empty ? (
            <span className="text-2xl font-bold tabular-nums text-ink-faint">–</span>
          ) : priced ? (
            <span className="text-3xl font-bold tabular-nums">{formatMoney(priced.total, currency)}</span>
          ) : (
            <Skeleton className="h-9 w-24" />
          )}
        </div>
        <Button variant="primary" size="lg" className="min-h-14 w-full text-lg" disabled={!canSend} onClick={onSend}>
          <Send size={19} aria-hidden />
          {sending ? "Sending..." : "Send to Kitchen"}
        </Button>
        {needsTable && !empty && <p className="text-center text-xs text-ink-faint">Choose a table first, or switch to Takeaway.</p>}
      </div>
    </>
  );
}
