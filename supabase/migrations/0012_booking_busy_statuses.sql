-- 0012_booking_busy_statuses.sql - seated bookings and open table sessions block a table.
-- Paste into the Supabase SQL Editor and run once. Requires 0006, 0008 and 0011.
--
-- THE BUG: find_free_table only looked at bookings with status = 'confirmed'.
-- When a booking became 'seated' the guests were at the table, but the table
-- looked free, so the phone agent could book it again.
--
-- THE FIX (one function, used by BOTH /api/tools/check-availability and
-- create_booking_tx, so they always agree). A table is BUSY for a requested
-- 90-minute window when:
--   1. it has a booking with status 'confirmed' OR 'seated' whose own 90-minute
--      window overlaps (same rule as before, just one more status), or
--   2. it has an OPEN table_session (cleared_at is null) seated less than
--      90 minutes before the end of the window and not more than 90 minutes
--      after its start - i.e. the session counts as busy for 90 minutes from
--      seated_at, walk-in or booking.
-- 'cancelled', 'no_show' and 'completed' bookings leave the table free.
-- The 90-minute length is unchanged.
--
-- table_sessions.seated_at is a real instant (timestamptz) while bookings use
-- a plain date + time, so seated_at is converted to the restaurant's own
-- timezone (restaurants.timezone, London for Napoli) before comparing.
--
-- create_booking_tx is NOT changed: it already calls find_free_table under its
-- per-(restaurant, date) lock right before the insert, so it picks up the new
-- rules automatically and still re-checks at insert time.
--
-- Same function name and arguments as 0006, so create or replace is enough.
-- No GRANT statements (CLAUDE.md rule 8). RLS settings are unchanged.

create or replace function public.find_free_table(
  p_restaurant_id uuid,
  p_date          date,
  p_time          time,
  p_party_size    int
)
returns setof public.restaurant_tables
language sql
stable
security invoker
set search_path = ''
as $$
  select t.*
  from public.restaurant_tables t
  where t.restaurant_id = p_restaurant_id
    and t.seats >= p_party_size
    -- Busy by a booking: confirmed or seated, window overlaps.
    and not exists (
      select 1
      from public.bookings b
      where b.table_id = t.id
        and b.status in ('confirmed', 'seated')
        and b.booking_date = p_date
        -- booking_duration_minutes: change all the 90s in this function together.
        and b.booking_time > p_time - interval '90 minutes'
        and b.booking_time < p_time + interval '90 minutes'
    )
    -- Busy by someone sitting there right now (walk-in or booking).
    and not exists (
      select 1
      from public.table_sessions s
      where s.table_id = t.id
        and s.cleared_at is null
        and (s.seated_at at time zone coalesce(
              (select r.timezone from public.restaurants r where r.id = p_restaurant_id),
              'Europe/London'))
            > (p_date + p_time) - interval '90 minutes'
        and (s.seated_at at time zone coalesce(
              (select r.timezone from public.restaurants r where r.id = p_restaurant_id),
              'Europe/London'))
            < (p_date + p_time) + interval '90 minutes'
    )
  order by t.seats, length(t.table_number), t.table_number
  limit 1;
$$;
