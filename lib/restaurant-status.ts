import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { checkOpen, localClock, nextOpening, type OpeningHours } from "@/lib/opening-hours";

// "Are we open right now, and if not, when?" — shared by the restaurant-status
// tool and the chat test rig, so both always agree with create-order.

export type RestaurantStatus = {
  is_open: boolean;
  accepting_orders: boolean;
  next_open: string | null; // ISO instant, e.g. "2026-11-12T16:00:00.000Z"
  next_open_local: string | null; // restaurant wall clock, e.g. "16:00"
  next_open_spoken: string | null; // "four o'clock" / "tomorrow at four o'clock"
  now_local: string; // "Thursday 14:05"
  speech: string | null; // null when open: just greet normally
};

export async function getRestaurantStatus(restaurantId: string, now = new Date()): Promise<RestaurantStatus | null> {
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("is_accepting_orders, opening_hours, timezone")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const tz = data.timezone ?? "Europe/London";
  const hours = data.opening_hours as OpeningHours | null;
  const isOpen = checkOpen(hours, tz, now).open;
  const next = isOpen ? null : nextOpening(hours, tz, now);
  const clock = localClock(tz, now);
  // Taking orders at all: the owner hasn't switched them off, and there is
  // either service now or a known next opening to pre-order for.
  const accepting = Boolean(data.is_accepting_orders) && (isOpen || next !== null);

  let speech: string | null = null;
  if (!data.is_accepting_orders || (!isOpen && !next)) {
    speech = "Sorry, we're not taking any orders at the moment.";
  } else if (!isOpen && next) {
    speech = `We're closed at the moment, we open at ${next.spoken}. I can still take your order for then if you like.`;
  }

  return {
    is_open: isOpen,
    accepting_orders: accepting,
    next_open: next ? next.at.toISOString() : null,
    next_open_local: next ? next.hhmm : null,
    next_open_spoken: next ? next.spoken : null,
    now_local: `${clock.weekday} ${clock.hhmm}`,
    speech,
  };
}
