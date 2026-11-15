-- 0011_booking_statuses.sql — more booking statuses for the dashboard.
-- Paste into the Supabase SQL Editor and run once. Requires 0006.
--
-- Until now a booking could only be 'confirmed' or 'cancelled'. The dashboard
-- Bookings tab also needs:
--   seated     the booked party has arrived and sits at a table
--   completed  the party has left
--   no_show    the party never came
--
-- Only the allowed-values check on bookings.status changes. No data is touched,
-- no GRANT statements (see CLAUDE.md rule 8), RLS settings are unchanged.

do $$
declare
  c record;
begin
  -- Drop the old check on "status" whatever name it was given.
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.bookings drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.bookings
  add constraint bookings_status_check
  check (status in ('confirmed', 'seated', 'completed', 'cancelled', 'no_show'));
