"use client";

import { BILL_UNPAID_ERROR } from "@/lib/tables";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarX, CircleAlert, Clock, Phone, Search, Users } from "lucide-react";
import { Badge, Button, Card, EmptyState, FilterChips, PageHeader, StatusBadge, cn } from "@/components/ui";

export type Range = "today" | "tomorrow" | "week" | "custom";

export type BoardBooking = {
  id: string;
  reference: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  name: string;
  phone: string;
  party_size: number;
  table_id: string | null;
  table_number: string | null;
  menu_preferences: string | null;
  status: string;
  open_session_id: string | null; // the table session still open for this booking, if any
};

const RANGES = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "custom", label: "Custom" },
] as const;

const EMPTY_TITLE: Record<Range, string> = {
  today: "No bookings today",
  tomorrow: "No bookings tomorrow",
  week: "No bookings this week",
  custom: "No bookings on this day",
};

const REFRESH_MS = 30_000;

// "Sat 15 Nov" from a YYYY-MM-DD string. UTC on purpose: it is a calendar date, not a moment.
const formatDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// Cancelled, completed and no-show bookings are over; they stay visible but quieter.
const FINISHED = ["cancelled", "completed", "no_show"];

type PostResult = { ok: true } | { ok: false; status: number; error: string };

async function post(url: string, body: unknown): Promise<PostResult> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, status: res.status, error: json?.error ?? "Something went wrong." };
  } catch {
    return { ok: false, status: 0, error: "Network problem. Try again." };
  }
}

export function BookingsBoard({
  bookings,
  restaurantId,
  range,
  customDate,
  today,
}: {
  bookings: BoardBooking[];
  restaurantId: string;
  range: Range;
  customDate: string;
  today: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null); // booking whose Cancel is waiting for a yes
  const [error, setError] = useState<string | null>(null);
  const [loadingDay, startTransition] = useTransition();

  // Keep the list live: re-read the bookings every 30 seconds.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  // The day filter lives in the address, so the server loads only those days.
  function goTo(nextRange: Range, date?: string) {
    const params = new URLSearchParams({ range: nextRange });
    if (nextRange === "custom") params.set("date", date ?? customDate);
    setConfirmId(null);
    startTransition(() => router.replace(`/dashboard/bookings?${params}`));
  }

  // Search by name, phone (spaces ignored) or reference (B-2001, or just 2001).
  const q = search.trim().toLowerCase();
  const qDigits = q.replace(/[\s()+-]/g, "");
  const visible = q
    ? bookings.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.reference.toLowerCase().includes(q) ||
          (qDigits !== "" && b.phone.replace(/[\s()+-]/g, "").includes(qDigits)),
      )
    : bookings;

  // Runs a list of steps in order and stops at the first one that fails.
  async function run(booking: BoardBooking, steps: (() => Promise<PostResult>)[]) {
    setBusyId(booking.id);
    setError(null);
    setConfirmId(null);
    for (const step of steps) {
      const r = await step();
      if (!r.ok) {
        setError(r.status === 401 ? "You were logged out. Please log in again." : r.error);
        break;
      }
    }
    router.refresh();
    setBusyId(null);
  }

  const setStatus = (b: BoardBooking, status: string) => () => post("/api/staff/update-booking-status", { booking_id: b.id, status });

  // Seat now: the existing seat-table route does the seating (table size, one party per table);
  // then the booking itself becomes "seated".
  const seat = (b: BoardBooking) =>
    run(b, [
      () =>
        post("/api/staff/seat-table", {
          restaurant_id: restaurantId,
          table_id: b.table_id,
          party_size: b.party_size,
          booking_id: b.id,
        }),
      setStatus(b, "seated"),
    ]);

  // Complete: free the table first (existing clear-table route) if it is still open.
  const complete = (b: BoardBooking) =>
    run(b, [
      ...(b.open_session_id
        ? [
            async (): Promise<PostResult> => {
              const r = await post("/api/staff/clear-table", { table_session_id: b.open_session_id });
              // 409 = someone already cleared it: fine, carry on and complete the booking.
              // But 409 "bill unpaid" means the table is NOT cleared: stop and show it.
              return !r.ok && r.status === 409 && r.error !== BILL_UNPAID_ERROR ? { ok: true } : r;
            },
          ]
        : []),
      setStatus(b, "completed"),
    ]);

  const subtitle = (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="dot-pulse size-2 rounded-full bg-status-ready" />
      Live. Updates every 30 seconds.
    </span>
  );

  return (
    <div>
      <PageHeader title="Bookings" subtitle={subtitle} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterChips label="Day" chips={RANGES} value={range} onChange={(k) => goTo(k)} />
        {range === "custom" && (
          <input
            type="date"
            aria-label="Pick a date"
            value={customDate}
            onChange={(e) => e.target.value && goTo("custom", e.target.value)}
            className="min-h-11 rounded-xl border border-line bg-raised px-3 text-sm text-ink [color-scheme:dark] focus:border-brand-line focus:outline-none"
          />
        )}
        {range === "today" && <span className="text-xs text-ink-faint">{formatDate(today)}</span>}
      </div>

      <label className="relative mb-5 block max-w-md">
        <span className="sr-only">Search bookings</span>
        <Search size={16} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone or B-2001"
          className="min-h-11 w-full rounded-xl border border-line bg-raised pl-11 pr-4 text-sm text-ink placeholder:text-ink-faint focus:border-brand-line focus:outline-none"
        />
      </label>

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
            icon={<CalendarX size={20} />}
            title={q ? "No bookings match your search" : EMPTY_TITLE[range]}
            message={
              q
                ? "Try a different name, phone number or booking reference."
                : "Table bookings made by the phone agent appear here by themselves."
            }
          />
        </Card>
      ) : (
        <ul className={cn("grid gap-4 transition-opacity md:grid-cols-2 xl:grid-cols-3", loadingDay && "opacity-50")}>
          {visible.map((b) => {
            const busy = busyId === b.id;
            const finished = FINISHED.includes(b.status);
            return (
              <li
                key={b.id}
                className={cn(
                  "anim-rise flex flex-col rounded-2xl border border-line bg-surface p-5 transition-colors duration-200 hover:border-line-strong",
                  finished && "opacity-70",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-bold tabular-nums">{b.reference}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint">
                      <Clock size={13} aria-hidden />
                      <span className="tabular-nums">
                        {b.time}
                        {range === "week" && ` · ${formatDate(b.date)}`}
                      </span>
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>

                <div className="mt-4 flex-1 space-y-2 border-t border-line pt-4 text-sm">
                  <p className="font-semibold">{b.name}</p>
                  <a href={`tel:${b.phone.replace(/\s/g, "")}`} className="flex w-fit items-center gap-1.5 text-ink-muted hover:text-ink">
                    <Phone size={13} aria-hidden />
                    <span className="tabular-nums">{b.phone}</span>
                  </a>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge>
                      <Users size={13} aria-hidden />
                      {b.party_size} {b.party_size === 1 ? "guest" : "guests"}
                    </Badge>
                    <Badge tone={b.table_number ? "neutral" : "danger"}>{b.table_number ? `Table ${b.table_number}` : "No table"}</Badge>
                  </div>
                  {b.menu_preferences && <p className="pt-1 text-ink-muted">“{b.menu_preferences}”</p>}
                </div>

                {b.status === "confirmed" && (
                  <div className="mt-4 space-y-2">
                    {confirmId === b.id ? (
                      <div role="group" aria-label="Confirm cancel" className="rounded-xl border border-danger/30 bg-danger/12 p-3">
                        <p className="mb-2 text-sm font-semibold text-danger">Cancel this booking for good?</p>
                        <div className="flex gap-2">
                          <Button onClick={() => run(b, [setStatus(b, "cancelled")])} disabled={busy} className="flex-1">
                            {busy ? "Saving..." : "Yes, cancel"}
                          </Button>
                          <Button onClick={() => setConfirmId(null)} disabled={busy} className="flex-1">
                            Keep it
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Button variant="primary" size="lg" onClick={() => seat(b)} disabled={busy || !b.table_id} className="w-full">
                          {busy ? "Saving..." : "Seat now"}
                        </Button>
                        {!b.table_id && <p className="text-xs text-ink-faint">No table is assigned, so it cannot be seated.</p>}
                        <div className="flex gap-2">
                          <Button onClick={() => run(b, [setStatus(b, "no_show")])} disabled={busy} className="flex-1">
                            No-show
                          </Button>
                          <Button onClick={() => setConfirmId(b.id)} disabled={busy} className="flex-1">
                            Cancel
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {b.status === "seated" && (
                  <Button variant="primary" size="lg" onClick={() => complete(b)} disabled={busy} className="mt-4 w-full">
                    {busy ? "Saving..." : "Complete"}
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
