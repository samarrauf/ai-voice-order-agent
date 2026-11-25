"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, FilterChips, KpiCard, type Chip } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { formatMoney } from "@/lib/money";
import { BILL_UNPAID_ERROR, busyTableActions, durationLabel, owedTotalPence, showClearAnyway, unpaidOrders } from "@/lib/tables";
import { printBillHref } from "@/lib/print-links";
import type { Floor, SessionOrder, TableView } from "@/lib/tables-data";
import { PaymentDialog } from "../pos/payment-dialog";
import { post } from "./post";

// The live floor: every active table as a coloured tile (free / seated / reserved soon),
// with Seat and Clear buttons. Seating and clearing use the existing staff routes, so the
// table-size and one-party-per-table rules are the same as everywhere else.

const TILE: Record<TableView["state"], string> = {
  free: "border-status-ready/40 bg-status-ready/8",
  seated: "border-status-preparing/45 bg-status-preparing/10",
  reserved: "border-status-new/45 bg-status-new/10",
};
const LABEL: Record<TableView["state"], string> = { free: "Free", seated: "Seated", reserved: "Reserved soon" };
const TONE = { free: "ready", seated: "preparing", reserved: "new" } as const;

const SELECT = "min-h-11 rounded-xl border border-line bg-raised px-3 text-sm text-ink";
const ALL = "all";
const NONE = "none";

export function TablesFloor({
  floor,
  restaurantId,
  canMerge = false,
  canPay = false,
  canPrint = false,
  canClearUnpaid = false,
}: {
  floor: Floor;
  restaurantId: string;
  canMerge?: boolean;
  /** can(role, "take_payment"): shows "Take bill". The server route checks the login again. */
  canPay?: boolean;
  /** can(role, "print_bill"): shows "Bill print". */
  canPrint?: boolean;
  /** can(role, "clear_unpaid"): shows "Clear anyway" (owner/manager). The server route checks the login again. */
  canClearUnpaid?: boolean;
}) {
  const router = useRouter();
  // The payment dialog (the POS one, unchanged) for one order of one table.
  const [paying, setPaying] = useState<{ tableId: string; order: SessionOrder } | null>(null);
  const [tab, setTab] = useState<string>(ALL);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [seatingId, setSeatingId] = useState<string | null>(null);
  const [party, setParty] = useState("2");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Move / merge panel on one seated table: which action, and what was picked.
  const [panel, setPanel] = useState<{ tableId: string; kind: "move" | "merge" } | null>(null);
  const [pickTable, setPickTable] = useState("");
  const [pickSource, setPickSource] = useState("");
  const [pickTarget, setPickTarget] = useState("");

  const active = floor.tables.filter((t) => t.isActive);
  const sections = floor.sections.filter((s) => s.is_active);
  const hasLoose = active.some((t) => !t.sectionId);

  const chips: Chip[] = [{ key: ALL, label: "All", count: active.length }];
  for (const s of sections) chips.push({ key: s.id, label: s.name, count: active.filter((t) => t.sectionId === s.id).length });
  if (sections.length > 0 && hasLoose) chips.push({ key: NONE, label: "No section", count: active.filter((t) => !t.sectionId).length });
  const selected = chips.some((c) => c.key === tab) ? tab : ALL;
  const shown = active.filter((t) => selected === ALL || (selected === NONE ? !t.sectionId : t.sectionId === selected));

  const count = (state: TableView["state"]) => active.filter((t) => t.state === state).length;
  const seatsInUse = active.reduce((n, t) => n + (t.session?.partySize ?? 0), 0);

  async function run(id: string, steps: (() => ReturnType<typeof post>)[]) {
    setBusyId(id);
    setError(null);
    for (const step of steps) {
      const r = await step();
      if (!r.ok) {
        setError(r.message);
        break;
      }
    }
    setSeatingId(null);
    router.refresh();
    setBusyId(null);
  }

  const seat = (t: TableView, partySize: number, bookingId?: string) =>
    run(t.id, [
      () => post("/api/staff/seat-table", { restaurant_id: restaurantId, table_id: t.id, party_size: partySize, ...(bookingId ? { booking_id: bookingId } : {}) }),
      ...(bookingId ? [() => post("/api/staff/update-booking-status", { booking_id: bookingId, status: "seated" })] : []),
    ]);

  // Clearing a booked party also completes the booking, so it stops holding the table for 90 minutes.
  const clear = (t: TableView, unpaid = false) => {
    const s = t.session!;
    return run(t.id, [
      async () => {
        const r = await post("/api/staff/clear-table", { table_session_id: s.id, ...(unpaid ? { clear_unpaid: true } : {}) });
        // 409 = already cleared (fine); 409 "bill unpaid" = still seated, show the message.
        return !r.ok && r.status === 409 && r.message !== BILL_UNPAID_ERROR ? { ok: true, status: 200, message: "" } : r;
      },
      ...(s.bookingId
        ? [
            async () => {
              const r = await post("/api/staff/update-booking-status", { booking_id: s.bookingId, status: "completed" });
              return !r.ok && r.status === 409 ? { ok: true, status: 200, message: "" } : r;
            },
          ]
        : []),
    ]);
  };

  function clearAnyway(t: TableView) {
    const owed = formatMoney(owedTotalPence(t.session!.orders) / 100);
    const ok = window.confirm(
      `Table ${t.number}: bill abhi PAID NAHI hai. Baaki: ${owed}.\n\nClear karne par table free ho jayegi, lekin yeh unpaid order Orders board par baaki rahega aur record ho jayega ke aap ne clear kiya.\n\nKya aap sach mein clear karna chahte hain?`,
    );
    if (ok) void clear(t, true);
  }

  const freeTables = active.filter((x) => x.state !== "seated");
  const mergeTargets = (t: TableView) =>
    active.flatMap((x) => (x.id === t.id || !x.session ? [] : x.session.orders.filter((o) => !o.paid).map((o) => ({ ...o, table: x.number }))));

  function openPanel(t: TableView, kind: "move" | "merge") {
    setError(null);
    setNotice(null);
    setPanel({ tableId: t.id, kind });
    setPickTable(freeTables[0]?.id ?? "");
    setPickSource(t.session?.orders.find((o) => !o.paid)?.id ?? "");
    setPickTarget(mergeTargets(t)[0]?.id ?? "");
  }

  type PanelAnswer = { success?: boolean; error?: string; to_table?: string; seats_warning?: boolean; seats?: number; party_size?: number; target_order_number?: string; source_table_cleared?: boolean };

  async function submitPanel(t: TableView) {
    if (!panel) return;
    setBusyId(t.id);
    setError(null);
    setNotice(null);
    const move = panel.kind === "move";
    try {
      const res = await fetch(move ? "/api/staff/move-table" : "/api/staff/merge-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(move ? { table_session_id: t.session!.id, to_table_id: pickTable } : { source_order_id: pickSource, target_order_id: pickTarget }),
      });
      const json = (await res.json().catch(() => null)) as PanelAnswer | null;
      if (res.ok && json?.success) {
        setNotice(
          move
            ? `Moved to table ${json.to_table}.${json.seats_warning ? ` Warning: that table has ${json.seats} seats for a party of ${json.party_size}.` : ""}`
            : `Merged into order ${json.target_order_number}.${json.source_table_cleared ? " The other table is free now." : ""}`,
        );
        setPanel(null);
      } else if (res.status === 401) setError("You were logged out. Please log in again.");
      else if (res.status === 403) setError("You do not have permission to do this.");
      else setError(json?.error ? `Could not ${move ? "move" : "merge"}: ${json.error}.` : "Something went wrong.");
    } catch {
      setError("Network problem. Try again.");
    }
    router.refresh();
    setBusyId(null);
  }

  const startSeat = (t: TableView) => {
    setError(null);
    setSeatingId(t.id);
    setParty(String(Math.min(2, t.seats)));
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Free" value={String(count("free"))} tone={3} />
        <KpiCard label="Seated" value={String(count("seated"))} tone={2} />
        <KpiCard label="Reserved soon" value={String(count("reserved"))} tone={1} />
        <KpiCard label="Seats in use" value={String(seatsInUse)} note={`of ${active.reduce((n, t) => n + t.seats, 0)}`} tone={4} />
      </div>

      <Card className="mt-4">
        <CardHeader title="Floor" hint="Updates every 30 seconds" />
        {chips.length > 1 && <FilterChips label="Section" chips={chips} value={selected} onChange={setTab} className="mb-4" />}
        {notice && (
          <p role="status" className="mb-3 rounded-xl border border-line bg-raised px-3 py-2.5 text-sm text-ink">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-3 rounded-xl border border-danger/30 bg-danger/12 px-3 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}
        {shown.length === 0 ? (
          <EmptyState
            icon={<LayoutGrid size={20} />}
            title="No tables here yet"
            message={active.length === 0 ? "Add your tables below (owner or manager) and they will show here." : "No active table in this section."}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((t) => {
              const busy = busyId === t.id;
              return (
                <li key={t.id} className={cn("flex flex-col gap-3 rounded-2xl border p-4", TILE[t.state])}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold leading-tight">Table {t.number}</p>
                      <p className="text-xs text-ink-muted">{t.seats} seats{t.notes ? ` · ${t.notes}` : ""}</p>
                    </div>
                    <Badge tone={TONE[t.state]} dot live={t.state === "seated"}>
                      {LABEL[t.state]}
                    </Badge>
                  </div>

                  {t.state === "seated" && t.session && (
                    <p className="text-sm">
                      Party of {t.session.partySize} · {durationLabel(t.session.minutes)}
                      <span className="block font-semibold">Bill {formatMoney(t.session.bill, floor.currency)}</span>
                    </p>
                  )}
                  {t.state === "reserved" && t.booking && (
                    <p className="text-sm">
                      {t.booking.time} · {t.booking.name} ({t.booking.partySize})
                      <span className="block text-xs text-ink-muted">
                        {t.booking.reference} · {t.booking.inMinutes > 0 ? `in ${durationLabel(t.booking.inMinutes)}` : "due now"}
                      </span>
                    </p>
                  )}

                  {panel?.tableId === t.id && t.session ? (
                    <div className="flex flex-col gap-2">
                      {panel.kind === "move" ? (
                        <>
                          <label className="text-xs text-ink-muted" htmlFor={`move-${t.id}`}>
                            Move this party to
                          </label>
                          <select id={`move-${t.id}`} value={pickTable} onChange={(e) => setPickTable(e.target.value)} className={SELECT}>
                            {freeTables.length === 0 && <option value="">No free table</option>}
                            {freeTables.map((x) => (
                              <option key={x.id} value={x.id}>
                                Table {x.number} ({x.seats} seats){x.state === "reserved" ? " - booked soon" : ""}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <>
                          <label className="text-xs text-ink-muted" htmlFor={`msrc-${t.id}`}>
                            Take the items of
                          </label>
                          <select id={`msrc-${t.id}`} value={pickSource} onChange={(e) => setPickSource(e.target.value)} className={SELECT}>
                            {t.session.orders
                              .filter((o) => !o.paid)
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.number} - {formatMoney(o.total, floor.currency)}
                                </option>
                              ))}
                          </select>
                          <label className="text-xs text-ink-muted" htmlFor={`mtgt-${t.id}`}>
                            and add them to
                          </label>
                          <select id={`mtgt-${t.id}`} value={pickTarget} onChange={(e) => setPickTarget(e.target.value)} className={SELECT}>
                            {mergeTargets(t).length === 0 && <option value="">No other open order</option>}
                            {mergeTargets(t).map((o) => (
                              <option key={o.id} value={o.id}>
                                Table {o.table} - {o.number} - {formatMoney(o.total, floor.currency)}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                      <div className="flex gap-2">
                        <Button variant="primary" disabled={busy || (panel.kind === "move" ? !pickTable : !pickSource || !pickTarget)} onClick={() => submitPanel(t)}>
                          {panel.kind === "move" ? "Move" : "Merge"}
                        </Button>
                        <Button onClick={() => setPanel(null)} disabled={busy}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : seatingId === t.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs text-ink-muted" htmlFor={`party-${t.id}`}>
                        Guests
                      </label>
                      <input
                        id={`party-${t.id}`}
                        type="number"
                        min={1}
                        max={t.seats}
                        inputMode="numeric"
                        value={party}
                        onChange={(e) => setParty(e.target.value)}
                        className="min-h-11 w-20 rounded-xl border border-line bg-raised px-3 text-sm text-ink focus:border-line-strong"
                      />
                      <Button variant="primary" disabled={busy || !(Number(party) >= 1)} onClick={() => seat(t, Number(party))}>
                        Seat
                      </Button>
                      <Button onClick={() => setSeatingId(null)} disabled={busy}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-auto flex flex-wrap gap-2">
                      {t.state === "seated" && t.session ? (
                        <>
                          {(() => {
                            const orders = t.session.orders;
                            const a = busyTableActions(orders, { canPay, canPrint });
                            const owing = unpaidOrders(orders);
                            const many = orders.length > 1;
                            return (
                              <>
                                {a.pay &&
                                  owing.map((o) => (
                                    <Button key={o.id} variant="primary" disabled={busy} onClick={() => setPaying({ tableId: t.id, order: o })}>
                                      {owing.length > 1 ? `Take bill · ${o.number}` : "Take bill"}
                                    </Button>
                                  ))}
                                {a.printBill &&
                                  orders.map((o) => (
                                    <a
                                      key={o.id}
                                      href={printBillHref(o.id)}
                                      target="_blank"
                                      rel="noopener"
                                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-raised px-3 text-sm font-semibold transition duration-200 hover:border-line-strong active:scale-[0.98]"
                                    >
                                      {many ? `Bill print · ${o.number}` : "Bill print"}
                                    </a>
                                  ))}
                                {owing.length > 0 && (
                                  <p className="basis-full text-xs text-ink-muted">Clear table appears once the bill is paid.</p>
                                )}
                                {showClearAnyway(orders, canClearUnpaid) && (
                                  <Button variant="secondary" disabled={busy} onClick={() => clearAnyway(t)}>
                                    Clear anyway
                                  </Button>
                                )}
                                {(orders.length === 0 || a.clearReady) && (
                                  <Button variant={a.clearReady ? "primary" : "secondary"} disabled={busy} onClick={() => clear(t)}>
                                    Clear table
                                  </Button>
                                )}
                              </>
                            );
                          })()}
                          <Button variant="ghost" disabled={busy} onClick={() => openPanel(t, "move")}>
                            Move table
                          </Button>
                          {canMerge && t.session && t.session.orders.some((o) => !o.paid) && (
                            <Button variant="ghost" disabled={busy} onClick={() => openPanel(t, "merge")}>
                              Merge orders
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          {t.state === "reserved" && t.booking && (
                            <Button variant="primary" disabled={busy} onClick={() => seat(t, Math.min(t.booking!.partySize, t.seats), t.booking!.id)}>
                              Seat booking
                            </Button>
                          )}
                          <Button variant={t.state === "free" ? "primary" : "ghost"} disabled={busy} onClick={() => startSeat(t)}>
                            Seat walk-in
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {paying && (
        <PaymentDialog
          order={{ orderId: paying.order.id, orderNumber: paying.order.number, total: paying.order.total, where: "" }}
          alreadyPaid={paying.order.paidAmount}
          restaurantId={restaurantId}
          currency={floor.currency}
          onBack={() => setPaying(null)}
          onClose={() => {
            setPaying(null);
            router.refresh(); // fresh balances; Clear table shows once everything is paid
          }}
        />
      )}
    </div>
  );
}
