"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Armchair, ArrowRight, Ban, CircleAlert, Clock, Inbox, Phone, RotateCcw, Store, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, FilterChips, PageHeader, StatusBadge, cn } from "@/components/ui";
import { PaymentStatusBadge } from "@/components/ui/payment-status-badge";
import { formatMoney } from "@/lib/money";
import { NewOrderLink } from "./new-order-link";
import { PrintButtons } from "./print-buttons";
import { ThankYouButton } from "./thankyou-button";
import { CostLine } from "./cost-line";
import type { BoardOrder } from "@/lib/orders-board";
import { can, type StaffRole } from "@/lib/permissions";
import { cancelNeeds } from "@/lib/order-adjust";
import { CancelDialog, RefundDialog, VoidDialog } from "./order-actions";

export type { BoardOrder } from "@/lib/orders-board";

const TABS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "completed", label: "Completed" },
] as const;

// What pressing the button on an order does next.
const NEXT: Record<string, { status: string; label: string } | undefined> = {
  new: { status: "preparing", label: "Start preparing" },
  accepted: { status: "preparing", label: "Start preparing" },
  preparing: { status: "ready", label: "Mark ready" },
  ready: { status: "completed", label: "Complete" },
};

const STATUS_LABEL: Record<string, string> = {
  new: "New", accepted: "New", preparing: "Preparing", ready: "Ready", completed: "Completed", cancelled: "Cancelled",
};

const REFRESH_MS = 15_000;

const sourceLabel = (o: BoardOrder) =>
  o.source === "phone"
    ? "Phone"
    : o.source === "staff_phone"
      ? "Staff phone"
      : o.source === "walk_in"
        ? "Walk-in"
        : `Table ${o.table_number ?? "?"}`;

// A fixed time zone so the server and the browser print the same time.
const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

// Icon shown next to where the order came from. Anything else is a table order.
const SOURCE_ICON: Record<string, typeof Phone> = { phone: Phone, staff_phone: Phone, walk_in: Store };

type Dialog =
  | { kind: "cancel" | "refund"; order: BoardOrder }
  | { kind: "void"; order: BoardOrder; item: { id: string; name: string; quantity: number } }
  | null;

const METHOD: Record<string, string> = { cash: "Cash", card: "Card", online: "Online", other: "Other" };

export function OrdersBoard({
  orders,
  restaurantId,
  currency,
  role,
}: {
  orders: BoardOrder[];
  restaurantId: string;
  currency: string;
  role: StaffRole;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const canCancelAny = can(role, "cancel_order");
  const canRefund = can(role, "refund_payment");
  const canVoid = can(role, "void_item");
  const done = () => {
    setDialog(null);
    router.refresh();
  };
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("new");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep the board live: re-read the orders every 15 seconds.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  const group = (o: BoardOrder) => (o.status === "accepted" ? "new" : o.status);
  const count = (key: string) => (key === "all" ? orders.length : orders.filter((o) => group(o) === key).length);
  const visible = tab === "all" ? orders : orders.filter((o) => group(o) === tab);

  async function advance(order: BoardOrder, status: string) {
    setBusyId(order.id);
    setError(null);
    try {
      const res = await fetch("/api/staff/update-order-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurant_id: restaurantId, order_id: order.id, status }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "You were logged out. Please log in again." : "Could not update the order. Try again.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Orders"
        actions={<NewOrderLink />}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="dot-pulse size-2 rounded-full bg-status-ready" />
            Live. Updates every 15 seconds.
          </span>
        }
      />

      <FilterChips
        label="Order status"
        chips={TABS.map((t) => ({ ...t, count: count(t.key) }))}
        value={tab}
        onChange={setTab}
        className="mb-5"
      />

      {error && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/12 px-4 py-3 text-sm text-danger">
          <CircleAlert size={16} aria-hidden className="shrink-0" />
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <Card className="anim-rise">
          <EmptyState
            className="min-h-64"
            icon={<Inbox size={20} />}
            title={tab === "all" ? "No orders yet" : `No ${STATUS_LABEL[tab].toLowerCase()} orders`}
            message="Phone, walk-in and table orders appear here by themselves as they come in."
          />
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((o) => {
            const next = NEXT[o.status];
            const isNew = group(o) === "new";
            const Source = SOURCE_ICON[o.source] ?? Armchair;
            // B4b actions. The server checks the same rules again (under a row lock).
            const open = !["cancelled", "completed", "merged"].includes(o.status);
            const unpaid = o.paid_amount <= 0 && o.refunded_amount <= 0;
            const liveItems = o.items.filter((i) => !i.voided).length;
            const voidable = canVoid && open && unpaid && liveItems > 1;
            const needs = cancelNeeds(o);
            const cancellable = needs === "anyone" || (needs === "manager" && canCancelAny && (o.paid_amount <= 0 || canRefund));
            const refundable = canRefund && o.paid_amount > 0 && o.payment_status !== "partial";
            return (
              <li
                key={o.id}
                className={cn(
                  "flex flex-col rounded-2xl border bg-surface p-5 transition-colors duration-200",
                  isNew ? "order-new border-status-new/40" : "anim-rise border-line hover:border-line-strong",
                  !next && "opacity-70",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-bold tabular-nums">{o.order_number}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint">
                      <Clock size={13} aria-hidden />
                      <span className="tabular-nums">{formatTime(o.created_at)}</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusBadge status={o.status} />
                    {o.has_new_items && (
                      <Badge tone="preparing" dot>
                        New items
                      </Badge>
                    )}
                    <PaymentStatusBadge status={o.payment_status} />
                  </div>
                </div>

                <Badge className="mt-3 self-start">
                  <Source size={13} aria-hidden />
                  {sourceLabel(o)}
                </Badge>

                <ul className="mt-4 flex-1 space-y-1.5 border-t border-line pt-4 text-sm">
                  {o.items.length === 0 ? (
                    <li className="text-ink-faint">No items</li>
                  ) : (
                    o.items.map((i) => (
                      <li key={i.id} className={cn("flex gap-2", i.voided && "text-ink-faint")}>
                        <span className={cn("w-7 shrink-0 font-bold tabular-nums", i.voided ? "line-through" : "text-highlight-ink")}>
                          {i.quantity}×
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn(i.voided && "line-through")}>{i.name}</span>
                          {i.size && <span className="text-ink-faint"> ({i.size})</span>}
                          {i.voided && (
                            <span className="mt-0.5 block text-xs font-semibold text-danger">
                              VOID{i.void_reason ? ` · ${i.void_reason}` : ""}
                            </span>
                          )}
                          {/* Owner only: the loader adds `cost` for view_profit (lib/orders-board.ts). */}
                          {i.cost && <CostLine cost={i.cost} currency={currency} className="mt-0.5" />}
                        </span>
                        {voidable && !i.voided && (
                          <button
                            type="button"
                            onClick={() => setDialog({ kind: "void", order: o, item: { id: i.id, name: i.name, quantity: i.quantity } })}
                            aria-label={`Void ${i.name}`}
                            className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-line px-2 text-xs font-semibold text-ink-muted hover:border-danger/40 hover:text-danger"
                          >
                            <X size={13} aria-hidden /> Void
                          </button>
                        )}
                      </li>
                    ))
                  )}
                </ul>

                <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Total</span>
                  <span className="text-2xl font-bold tabular-nums text-highlight-ink">{formatMoney(o.total, currency)}</span>
                </div>

                {o.profit && (
                  <div className="mt-2 flex items-baseline justify-between text-xs text-ink-faint">
                    <span>Profit (owner only)</span>
                    {o.profit.profit === null ? (
                      <span>Cost not set</span>
                    ) : (
                      <span className="tabular-nums">
                        <span className={o.profit.profit < 0 ? "font-semibold text-danger" : "font-semibold text-ink-muted"}>
                          {formatMoney(o.profit.profit, currency)}
                        </span>
                        {!o.profit.complete && <span> · some costs not set</span>}
                      </span>
                    )}
                  </div>
                )}

                {o.status === "cancelled" && o.cancel_reason && (
                  <p className="mt-3 rounded-xl border border-danger/30 bg-danger/12 px-3 py-2 text-xs">
                    <span className="font-semibold text-danger">Cancelled:</span> {o.cancel_reason}
                  </p>
                )}
                {o.refunds.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-xl border border-line bg-raised px-3 py-2 text-xs">
                    {o.refunds.map((r, n) => (
                      <li key={n}>
                        <span className="font-semibold tabular-nums">Refunded {formatMoney(r.amount, currency)}</span> (
                        {METHOD[r.method] ?? r.method}){r.reason && <span className="text-ink-muted"> · {r.reason}</span>}
                      </li>
                    ))}
                  </ul>
                )}

                <PrintButtons orderId={o.id} className="mt-4" />
                {o.thankyou && o.status !== "cancelled" && (
                  <ThankYouButton orderId={o.id} href={o.thankyou.url} clicked={o.thankyou.clicked} className="mt-2 w-full" />
                )}

                {(cancellable || refundable) && (
                  <div className="mt-3 flex gap-2">
                    {cancellable && (
                      <Button className="flex-1" onClick={() => setDialog({ kind: "cancel", order: o })}>
                        <Ban size={16} aria-hidden /> {o.paid_amount > 0 ? "Cancel and refund" : "Cancel"}
                      </Button>
                    )}
                    {refundable && (
                      <Button className="flex-1" onClick={() => setDialog({ kind: "refund", order: o })}>
                        <RotateCcw size={16} aria-hidden /> Refund
                      </Button>
                    )}
                  </div>
                )}

                {next && (
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => advance(o, next.status)}
                    disabled={busyId === o.id}
                    className="mt-4 w-full"
                  >
                    {busyId === o.id ? "Saving..." : next.label}
                    {busyId !== o.id && <ArrowRight size={18} aria-hidden />}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dialog?.kind === "cancel" && <CancelDialog order={dialog.order} currency={currency} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "refund" && <RefundDialog order={dialog.order} currency={currency} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "void" && <VoidDialog order={dialog.order} item={dialog.item} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}
