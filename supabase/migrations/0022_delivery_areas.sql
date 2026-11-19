-- 0022_delivery_areas.sql
-- P9a-B: delivery by postcode (as today), by a list of named areas, or not at all.
-- Paste into the Supabase SQL Editor and run once. Safe to run again. Needs 0001 to 0021.
--
-- 1. restaurants.delivery_mode:
--      'postcode'  = exactly today's behaviour (the postcode check in lib/delivery.ts).
--                    This is the default, so Napoli and every existing restaurant stay as they are.
--      'area_list' = the caller names their area; it must be on the restaurant's
--                    active list in delivery_areas. An empty list means no delivery.
--      'none'      = the restaurant does not deliver.
-- 2. Olive 'n Spice is set to 'area_list'. It has no areas yet, so delivery stays OFF
--    until the owner's list is added.
-- 3. delivery_areas: one row per area a restaurant delivers to. fee_override, when set,
--    replaces the restaurant's delivery_fee for that area. Names are unique per
--    restaurant, ignoring upper/lower case.
--    RLS is ON with NO policies: only the server (service key) can read or write it.
--    No GRANT statements (this project exposes new tables automatically; RLS controls access).
-- No new functions.

-- ---------- 1. restaurants.delivery_mode ----------
alter table public.restaurants
  add column if not exists delivery_mode text not null default 'postcode';

alter table public.restaurants drop constraint if exists restaurants_delivery_mode_check;
alter table public.restaurants
  add constraint restaurants_delivery_mode_check check (delivery_mode in ('postcode', 'area_list', 'none'));

-- ---------- 2. Olive 'n Spice: area list (no areas yet = no delivery) ----------
update public.restaurants
   set delivery_mode = 'area_list'
 where id = '22222222-2222-2222-2222-222222222222';

-- ---------- 3. delivery_areas ----------
create table if not exists public.delivery_areas (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  label         text not null check (length(btrim(label)) between 1 and 80),
  fee_override  numeric(10,2) check (fee_override is null or fee_override >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create unique index if not exists delivery_areas_restaurant_label_key
  on public.delivery_areas (restaurant_id, lower(label));

alter table public.delivery_areas enable row level security;
-- Deliberately no policies: anon and logged-in browser users see nothing.
