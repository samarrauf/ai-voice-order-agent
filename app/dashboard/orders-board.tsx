"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Armchair, ArrowRight, CircleAlert, Clock, Inbox, Phone, Store } from "lucide-react";
import { Badge, Button, Card, EmptyState, FilterChips, PageHeader, StatusBadge, cn } from "@/components/ui";
import { PaymentStatusBadge } from "@/components/ui/payment-status-badge";
import { formatMoney } from "@/lib/money";
import { NewOrderLink } from "./new-order-link";

export type BoardOrder = {
  id: string;
  order_number: string;
  status: string;
  source: string;
  table_number: string | null;
  total: number;
  payment_status: string;
  created_at: string;
  items: { name: string; size: string | null; quantity: number }[];
};

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
  o.source === "phone" ? "Phone" : o.source === "walk_in" ? "Walk-in" : `Table ${o.table_number ?? "?"}`;

// A fixed time zone so the server and the browser print the same time.
const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

// Icon shown next to where the order came from. Anything else is a table order.
const SOURCE_ICON: Record<string, typeof Phone> = { phone: Phone, walk_in: Store };

export function OrdersBoard({ orders }: { orders: BoardOrder[] }) {
  const router = useRouter();
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
        body: JSON.stringify({ order_id: order.id, status }),
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
                    o.items.map((i, n) => (
                      <li key={n} className="flex gap-2">
                        <span className="w-7 shrink-0 font-bold tabular-nums text-accent-ink">{i.quantity}×</span>
                        <span>
                          {i.name}
                          {i.size && <span className="text-ink-faint"> ({i.size})</span>}
                        </span>
                      </li>
                    ))
                  )}
                </ul>

                <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Total</span>
                  <span className="text-2xl font-bold tabular-nums">{formatMoney(o.total)}</span>
                </div>

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
    </div>
  );
}
