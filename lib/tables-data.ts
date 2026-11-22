import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  compareTableNumbers,
  isUpcomingBooking,
  liveState,
  minutesSince,
  minutesUntil,
  restaurantNow,
  type LiveState,
} from "@/lib/tables";

// Tables & venue: database reads. The restaurant id always comes from the login session.

export type SectionView = { id: string; name: string; sort_order: number; is_active: boolean };

/** A live order of a seated table (for the Move / Merge buttons). Never carries cost or profit. */
export type SessionOrder = { id: string; number: string; total: number; paid: boolean };

export type TableView = {
  id: string;
  number: string;
  seats: number;
  sectionId: string | null;
  isActive: boolean;
  notes: string | null;
  state: LiveState;
  /** Open seating session (state "seated"). */
  session: { id: string; partySize: number; minutes: number; bill: number; bookingId: string | null; orders: SessionOrder[] } | null;
  /** Next confirmed booking at this table (shown when reserved soon). */
  booking: { id: string; reference: string; name: string; partySize: number; time: string; inMinutes: number } | null;
};

export type Floor = { currency: string; sections: SectionView[]; tables: TableView[] };

export async function restaurantTimeZone(rid: string): Promise<string> {
  const r = await supabaseAdmin.from("restaurants").select("timezone").eq("id", rid).maybeSingle();
  return r.data?.timezone || "Europe/London";
}

export type Blockers = {
  openSession: boolean;
  /** Party size of the open session, if any. */
  openParty: number | null;
  bookings: { reference: string; date: string; time: string; party_size: number }[];
};

/** What stops a table from being switched off or made smaller: someone sitting there, or a booking still ahead. */
export async function tableBlockers(rid: string, tableId: string, now: Date = new Date()): Promise<Blockers> {
  const tz = await restaurantTimeZone(rid);
  const local = restaurantNow(tz, now);
  const [open, booked] = await Promise.all([
    supabaseAdmin.from("table_sessions").select("id, party_size").eq("restaurant_id", rid).eq("table_id", tableId).is("cleared_at", null).limit(1),
    supabaseAdmin
      .from("bookings")
      .select("booking_reference, booking_date, booking_time, party_size")
      .eq("restaurant_id", rid)
      .eq("table_id", tableId)
      .eq("status", "confirmed")
      .gte("booking_date", local.date)
      .order("booking_date")
      .order("booking_time")
      .limit(50),
  ]);
  if (open.error) throw open.error;
  if (booked.error) throw booked.error;
  return {
    openSession: (open.data ?? []).length > 0,
    openParty: open.data?.[0]?.party_size ?? null,
    bookings: (booked.data ?? [])
      .filter((b) => isUpcomingBooking({ booking_date: b.booking_date, booking_time: String(b.booking_time) }, local))
      .map((b) => ({
        reference: b.booking_reference,
        date: b.booking_date,
        time: String(b.booking_time).slice(0, 5),
        party_size: b.party_size,
      })),
  };
}

const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** The dining room: sections, every table and its live state. Inactive tables are included (flagged) for the editor. */
export async function loadFloor(rid: string, now: Date = new Date()): Promise<Floor> {
  const restaurant = await supabaseAdmin.from("restaurants").select("timezone, currency").eq("id", rid).maybeSingle();
  if (restaurant.error) throw restaurant.error;
  const local = restaurantNow(restaurant.data?.timezone || "Europe/London", now);

  const [sections, tables, sessions, bookings] = await Promise.all([
    supabaseAdmin.from("table_sections").select("id, name, sort_order, is_active").eq("restaurant_id", rid).order("sort_order").order("created_at"),
    supabaseAdmin.from("restaurant_tables").select("id, table_number, seats, section_id, is_active, notes").eq("restaurant_id", rid),
    supabaseAdmin.from("table_sessions").select("id, table_id, party_size, seated_at, booking_id").eq("restaurant_id", rid).is("cleared_at", null),
    supabaseAdmin
      .from("bookings")
      .select("id, table_id, booking_reference, customer_name, party_size, booking_date, booking_time")
      .eq("restaurant_id", rid)
      .eq("status", "confirmed")
      .not("table_id", "is", null)
      .gte("booking_date", local.date)
      .lte("booking_date", nextDay(local.date))
      .order("booking_date")
      .order("booking_time")
      .limit(500),
  ]);
  for (const r of [sections, tables, sessions, bookings]) if (r.error) throw r.error;

  // The running bill: every order of the open sessions that is not cancelled or merged.
  const sessionIds = (sessions.data ?? []).map((s) => s.id);
  const bills = new Map<string, number>();
  const sessionOrders = new Map<string, SessionOrder[]>();
  if (sessionIds.length > 0) {
    const orders = await supabaseAdmin
      .from("orders")
      .select("id, order_number, table_session_id, total, status, paid_amount")
      .eq("restaurant_id", rid)
      .in("table_session_id", sessionIds)
      .not("status", "in", "(cancelled,merged)");
    if (orders.error) throw orders.error;
    for (const o of orders.data ?? []) {
      if (!o.table_session_id) continue;
      bills.set(o.table_session_id, (bills.get(o.table_session_id) ?? 0) + Number(o.total));
      const list = sessionOrders.get(o.table_session_id) ?? [];
      list.push({ id: o.id, number: o.order_number, total: Number(o.total), paid: Number(o.paid_amount) > 0 });
      sessionOrders.set(o.table_session_id, list);
    }
  }

  const sessionByTable = new Map((sessions.data ?? []).map((s) => [s.table_id, s]));
  // Bookings are sorted by date and time, so the first one seen per table is its next.
  const nextByTable = new Map<string, NonNullable<typeof bookings.data>[number]>();
  for (const b of bookings.data ?? []) {
    const slot = { booking_date: b.booking_date, booking_time: String(b.booking_time) };
    if (b.table_id && !nextByTable.has(b.table_id) && isUpcomingBooking(slot, local)) nextByTable.set(b.table_id, b);
  }

  const views: TableView[] = (tables.data ?? []).map((t) => {
    const s = sessionByTable.get(t.id) ?? null;
    const b = nextByTable.get(t.id) ?? null;
    const slot = b ? { booking_date: b.booking_date, booking_time: String(b.booking_time) } : null;
    return {
      id: t.id,
      number: t.table_number,
      seats: t.seats,
      sectionId: t.section_id,
      isActive: t.is_active,
      notes: t.notes,
      state: liveState({ session: s ? { seatedAt: s.seated_at } : null, nextBooking: slot }, local),
      session: s ? { id: s.id, partySize: s.party_size, minutes: minutesSince(s.seated_at, now), bill: Math.round((bills.get(s.id) ?? 0) * 100) / 100, bookingId: s.booking_id, orders: sessionOrders.get(s.id) ?? [] } : null,
      booking:
        b && slot
          ? {
              id: b.id,
              reference: b.booking_reference,
              name: b.customer_name,
              partySize: b.party_size,
              time: slot.booking_time.slice(0, 5),
              inMinutes: minutesUntil(slot, local),
            }
          : null,
    };
  });
  views.sort((a, b) => compareTableNumbers(a.number, b.number));

  return { currency: restaurant.data?.currency ?? "GBP", sections: sections.data ?? [], tables: views };
}
