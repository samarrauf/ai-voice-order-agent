import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { requireStaffPage } from "@/lib/staff-page";
import { supabaseAdmin } from "@/lib/supabase/server";
import { Card, EmptyState, Skeleton, SkeletonCard } from "@/components/ui";
import { BookingsBoard, type BoardBooking, type Range } from "./bookings-board";

// Bookings: table reservations taken by the phone agent. The page reads the day
// filter from the address (?range=today|tomorrow|week|custom&date=2026-11-20),
// loads just those days from the database, and hands them to the board.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in the restaurant's time zone, as YYYY-MM-DD (the server may run in UTC). */
const londonToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** Adds whole days to a YYYY-MM-DD string. Works in UTC so daylight saving can't shift it. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const isRealDate = (s: string) => DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && addDays(s, 0) === s;

async function Bookings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // The restaurant always comes from the login session.
  const { restaurantId } = await requireStaffPage();
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const today = londonToday();
  const rangeParam = first(sp.range);
  const range: Range = rangeParam === "tomorrow" || rangeParam === "week" || rangeParam === "custom" ? rangeParam : "today";
  const dateParam = first(sp.date);
  const customDate = dateParam && isRealDate(dateParam) ? dateParam : today;

  // "This week" = from today until the coming Sunday (the end of the Monday-to-Sunday week).
  const daysToSunday = (7 - new Date(`${today}T00:00:00Z`).getUTCDay()) % 7;
  const [from, to] =
    range === "tomorrow"
      ? [addDays(today, 1), addDays(today, 1)]
      : range === "week"
        ? [today, addDays(today, daysToSunday)]
        : range === "custom"
          ? [customDate, customDate]
          : [today, today];

  // One query: the bookings with their table number and any seating session.
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select(
      `id, booking_reference, booking_date, booking_time, customer_name, customer_phone,
       party_size, menu_preferences, status, table_id,
       restaurant_tables ( table_number ),
       table_sessions ( id, cleared_at )`,
    )
    .eq("restaurant_id", restaurantId)
    .gte("booking_date", from)
    .lte("booking_date", to)
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true })
    .limit(300);

  if (error) {
    console.error("dashboard: failed to load bookings", error);
    return (
      <Card>
        <EmptyState
          className="min-h-64"
          icon={<CircleAlert size={20} />}
          title="Could not load bookings"
          message="Please refresh the page. If it keeps happening, check the internet connection."
        />
      </Card>
    );
  }

  // Supabase types nested joins loosely, so read them defensively.
  const bookings: BoardBooking[] = (data ?? []).map((b) => {
    const table = Array.isArray(b.restaurant_tables) ? b.restaurant_tables[0] : b.restaurant_tables;
    const sessions = Array.isArray(b.table_sessions) ? b.table_sessions : b.table_sessions ? [b.table_sessions] : [];
    return {
      id: b.id,
      reference: b.booking_reference,
      date: b.booking_date,
      time: String(b.booking_time).slice(0, 5),
      name: b.customer_name,
      phone: b.customer_phone,
      party_size: b.party_size,
      table_id: b.table_id,
      table_number: table?.table_number ?? null,
      menu_preferences: b.menu_preferences,
      status: b.status,
      open_session_id: sessions.find((s) => !s.cleared_at)?.id ?? null,
    };
  });

  return (
    <BookingsBoard bookings={bookings} restaurantId={restaurantId} range={range} customDate={customDate} today={today} />
  );
}

/** Shown while the bookings load: the same shape as the real page, in shimmering grey. */
function BookingsSkeleton() {
  return (
    <div role="status" aria-label="Loading bookings">
      <Skeleton className="h-10 w-44" />
      <Skeleton className="mt-3 h-4 w-56" />
      <div className="mt-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <Skeleton className="mt-4 h-11 w-full max-w-md rounded-xl" />
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

export default function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<BookingsSkeleton />}>
      <Bookings searchParams={searchParams} />
    </Suspense>
  );
}
