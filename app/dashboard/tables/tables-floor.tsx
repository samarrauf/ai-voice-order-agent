"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, FilterChips, KpiCard, type Chip } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { formatMoney } from "@/lib/money";
import { durationLabel } from "@/lib/tables";
import type { Floor, TableView } from "@/lib/tables-data";
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

const ALL = "all";
const NONE = "none";

export function TablesFloor({ floor, restaurantId }: { floor: Floor; restaurantId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<string>(ALL);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [seatingId, setSeatingId] = useState<string | null>(null);
  const [party, setParty] = useState("2");
  const [error, setError] = useState<string | null>(null);

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
  const clear = (t: TableView) => {
    const s = t.session!;
    return run(t.id, [
      async () => {
        const r = await post("/api/staff/clear-table", { table_session_id: s.id });
        return !r.ok && r.status === 409 ? { ok: true, status: 200, message: "" } : r;
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

                  {seatingId === t.id ? (
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
                      {t.state === "seated" ? (
                        <Button variant="secondary" disabled={busy} onClick={() => clear(t)}>
                          Clear table
                        </Button>
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
    </div>
  );
}
