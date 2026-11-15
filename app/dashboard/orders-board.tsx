"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type BoardOrder = {
  id: string;
  order_number: string;
  status: string;
  source: string;
  table_number: string | null;
  total: number;
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

const itemsSummary = (o: BoardOrder) =>
  o.items.map((i) => `${i.quantity}× ${i.name}${i.size ? ` (${i.size})` : ""}`).join(", ");

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
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-2xl font-semibold">Live Orders</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-4 py-1.5 text-sm ${tab === t.key ? "border-accent bg-accent text-accent-contrast" : "hover:bg-foreground/5"}`}
          >
            {t.label} ({count(t.key)})
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}

      {visible.length === 0 ? (
        <p className="py-12 text-center text-foreground/60">No orders here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((o) => {
            const next = NEXT[o.status];
            return (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{o.order_number}</span>
                    <span className="rounded bg-accent px-2 py-0.5 text-xs text-accent-contrast">{sourceLabel(o)}</span>
                    <span className="rounded border px-2 py-0.5 text-xs">{STATUS_LABEL[o.status] ?? o.status}</span>
                    <span className="text-sm text-foreground/60">{formatTime(o.created_at)}</span>
                  </div>
                  <p className="text-sm">{itemsSummary(o) || "No items"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">£{o.total.toFixed(2)}</span>
                  {next && (
                    <button
                      onClick={() => advance(o, next.status)}
                      disabled={busyId === o.id}
                      className="rounded bg-accent px-3 py-2 text-sm text-accent-contrast disabled:opacity-50"
                    >
                      {busyId === o.id ? "Saving..." : next.label}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
