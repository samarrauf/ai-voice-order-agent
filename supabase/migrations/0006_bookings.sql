-- 0006_bookings.sql — table bookings.
-- Paste into the Supabase SQL Editor and run once. Requires 0001_init.sql
-- (restaurants, set_updated_at). Then run supabase/seed_tables.sql.
--
-- Adds restaurant_tables + bookings and two functions:
--   find_free_table(...)   read-only: smallest free table that fits a party
--   create_booking_tx(...) atomic: find a free table and insert the booking
--
-- A booking keeps its table busy for 90 minutes from the booking time.
-- The 90 is written in ONE place (booking_duration_minutes below) so it is
-- easy to change later.

-- =========================================================
-- Tables
-- =========================================================

-- A physical table in a restaurant's dining room.
create table public.restaurant_tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_number  text not null,
  seats         int  not null check (seats > 0),
  created_at    timestamptz not null default now(),
  unique (restaurant_id, table_number)
);

-- Human-friendly booking references: B-2001, B-2002, ...
create sequence if not exists public.booking_reference_seq start with 2001 increment by 1;

create or replace function public.generate_booking_reference()
returns text
language sql
set search_path = ''
as $$
  select 'B-' || nextval('public.booking_reference_seq')::text;
$$;

-- A table booking, usually made during a call.
create table public.bookings (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete restrict,
  booking_reference text not null unique default public.generate_booking_reference(),
  table_id          uuid references public.restaurant_tables(id) on delete set null,
  customer_name     text not null,
  customer_phone    text not null,
  party_size        int  not null check (party_size > 0),
  booking_date      date not null,
  booking_time      time not null,
  menu_preferences  text,
  status            text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- =========================================================
-- Indexes
-- =========================================================
create index restaurant_tables_restaurant_id_idx on public.restaurant_tables (restaurant_id);
create index bookings_table_id_idx               on public.bookings (table_id);
-- The availability lookup: confirmed bookings for a restaurant on a date.
create index bookings_restaurant_date_idx
  on public.bookings (restaurant_id, booking_date)
  where status = 'confirmed';

-- =========================================================
-- Triggers
-- =========================================================
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- =========================================================
-- Row Level Security
-- =========================================================
-- On, with NO policies: like orders and calls, only the server (service role,
-- which bypasses RLS) can read or write. Customer phone numbers must never be
-- readable with the public key. No GRANT statements (see CLAUDE.md).
alter table public.restaurant_tables enable row level security;
alter table public.bookings          enable row level security;

-- =========================================================
-- Functions
-- =========================================================

-- Smallest free table with enough seats for the party, or no row if none.
-- "Free" = no confirmed booking on that table whose 90-minute window overlaps
-- the requested one. Two windows [a, a+90) and [b, b+90) overlap exactly when
-- the start times are less than 90 minutes apart.
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
    and not exists (
      select 1
      from public.bookings b
      where b.table_id = t.id
        and b.status = 'confirmed'
        and b.booking_date = p_date
        -- booking_duration_minutes: change the two 90s below together.
        and b.booking_time > p_time - interval '90 minutes'
        and b.booking_time < p_time + interval '90 minutes'
    )
  order by t.seats, length(t.table_number), t.table_number
  limit 1;
$$;

-- Atomic booking. Returns jsonb:
--   { "success": true,  "booking_reference", "table_number", "booking_date", "booking_time" }
--   { "success": false, "reason": "no_table" }        every big-enough table is taken then
--   { "success": false, "reason": "party_too_large" } no table here is ever big enough
--
-- RACE SAFETY: a transaction-scoped advisory lock on (restaurant, date) makes
-- concurrent bookings for the same day queue up. The second caller only runs
-- find_free_table AFTER the first has committed, so it sees the first booking
-- and gets a different table (or "no table"). The free-table check and the
-- insert therefore happen under the same lock; a check done earlier by
-- /api/tools/check-availability is never trusted.
create or replace function public.create_booking_tx(
  p_restaurant_id    uuid,
  p_date             date,
  p_time             time,
  p_party_size       int,
  p_customer_name    text,
  p_customer_phone   text,
  p_menu_preferences text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_table   public.restaurant_tables;
  v_booking public.bookings;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text || p_date::text, 0));

  select * into v_table from public.find_free_table(p_restaurant_id, p_date, p_time, p_party_size);

  if v_table.id is null then
    if exists (
      select 1 from public.restaurant_tables
      where restaurant_id = p_restaurant_id and seats >= p_party_size
    ) then
      return jsonb_build_object('success', false, 'reason', 'no_table');
    end if;
    return jsonb_build_object('success', false, 'reason', 'party_too_large');
  end if;

  insert into public.bookings (
    restaurant_id, table_id, customer_name, customer_phone,
    party_size, booking_date, booking_time, menu_preferences
  )
  values (
    p_restaurant_id, v_table.id, p_customer_name, p_customer_phone,
    p_party_size, p_date, p_time, p_menu_preferences
  )
  returning * into v_booking;

  return jsonb_build_object(
    'success', true,
    'booking_reference', v_booking.booking_reference,
    'table_number', v_table.table_number,
    'booking_date', v_booking.booking_date,
    'booking_time', to_char(v_booking.booking_time, 'HH24:MI')
  );
end;
$$;
