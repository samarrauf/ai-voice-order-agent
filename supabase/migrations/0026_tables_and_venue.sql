-- 0026_tables_and_venue.sql - sections, switch-off and notes for dining tables (P3a).
-- Paste into the Supabase SQL Editor and run once. Requires 0006, 0008 and 0012.
--
-- 1. table_sections: named areas of the dining room (Indoor, Terrace, ...).
--    RLS is on with NO policy: only the server (service role) can read or write.
-- 2. restaurant_tables gets section_id (null = no section), is_active (default
--    true) and notes (null). Every existing table keeps working: no section,
--    active. A table is never deleted from the dashboard, it is switched off, so
--    bookings and seating history stay intact.
-- 3. find_free_table and create_booking_tx only look at ACTIVE tables. The
--    90-minute rule, the busy statuses of 0012 and the per-(restaurant, date)
--    lock of 0006 are unchanged: the only edits are the two "is_active" lines.
--
-- Tenant safety: a table's section must belong to the SAME restaurant. The
-- database enforces it with a composite foreign key, not only the server code.
-- No new functions, no GRANT statements (CLAUDE.md rule 2).

create table public.table_sections (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 40),
  sort_order    int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  -- Target of the composite foreign key below.
  unique (id, restaurant_id)
);

-- One section name per restaurant, ignoring upper/lower case.
create unique index table_sections_name_uniq on public.table_sections (restaurant_id, lower(name));
create index table_sections_order_idx on public.table_sections (restaurant_id, sort_order);

alter table public.table_sections enable row level security;

alter table public.restaurant_tables
  add column section_id uuid,
  add column is_active  boolean not null default true,
  add column notes      text check (notes is null or length(notes) <= 200);

-- With section_id null the foreign key is not checked (no section).
alter table public.restaurant_tables
  add constraint restaurant_tables_section_fk
  foreign key (section_id, restaurant_id) references public.table_sections (id, restaurant_id);

create index restaurant_tables_section_idx on public.restaurant_tables (section_id);

-- =========================================================
-- find_free_table: same as 0012 plus "and t.is_active"
-- =========================================================
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
    and t.is_active
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

-- =========================================================
-- create_booking_tx: same as 0006, but "party_too_large" only counts ACTIVE tables
-- =========================================================
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
      where restaurant_id = p_restaurant_id and is_active and seats >= p_party_size
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
