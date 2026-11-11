-- 0001_init.sql — initial schema for the AI voice order agent.
-- Paste into the Supabase SQL Editor and run once.

-- =========================================================
-- Extensions
-- =========================================================
create extension if not exists pg_trgm with schema extensions;

-- =========================================================
-- Helper functions
-- =========================================================

-- Keeps an updated_at column current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Human-friendly order numbers: A-1001, A-1002, ...
create sequence if not exists public.order_number_seq start with 1001 increment by 1;

create or replace function public.generate_order_number()
returns text
language sql
set search_path = ''
as $$
  select 'A-' || nextval('public.order_number_seq')::text;
$$;

-- =========================================================
-- Tables
-- =========================================================

-- A restaurant that takes phone orders through the voice agent.
create table public.restaurants (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  phone                 text,
  address_line          text,
  city                  text,
  postcode              text,
  timezone              text not null default 'Europe/London',
  currency              text not null default 'GBP',
  is_accepting_orders   boolean not null default true,
  opening_hours         jsonb,
  delivery_radius_miles numeric(6,2),
  delivery_fee          numeric(10,2),
  min_order_value       numeric(10,2),
  created_at            timestamptz not null default now()
);

-- A section of a restaurant's menu (e.g. Starters, Pizzas, Drinks).
create table public.menu_categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- A single dish or product a customer can order.
create table public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id   uuid references public.menu_categories(id) on delete set null,
  name          text not null,
  description   text,
  base_price    numeric(10,2) not null,
  is_available  boolean not null default true,
  aliases       text[] not null default '{}',
  is_vegetarian boolean not null default false,
  spice_level   int,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- Size variants of a menu item; price is the absolute price, not a delta.
create table public.item_sizes (
  id           uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name         text not null,
  price        numeric(10,2) not null,
  is_default   boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- Add-ons / modifiers (e.g. Extra cheese), scoped to an item, a category, or the whole restaurant.
create table public.item_options (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id  uuid references public.menu_items(id) on delete cascade,
  category_id   uuid references public.menu_categories(id) on delete cascade,
  group_name    text not null,
  name          text not null,
  price_delta   numeric(10,2) not null default 0,
  max_select    int not null default 1,
  is_available  boolean not null default true,
  created_at    timestamptz not null default now()
);

-- One inbound phone call handled by the Vapi voice agent.
create table public.calls (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  vapi_call_id     text unique,
  from_number      text,
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_seconds int,
  outcome          text check (outcome in ('order_placed','enquiry_only','abandoned','transferred','failed')),
  transcript       text,
  recording_url    text,
  cost_usd         numeric(10,4),
  created_at       timestamptz not null default now()
);

-- A customer order, usually created during a call.
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete restrict,
  call_id           uuid references public.calls(id) on delete set null,
  order_number      text not null unique default public.generate_order_number(),
  fulfilment_type   text not null check (fulfilment_type in ('delivery','pickup')),
  status            text not null default 'new'
                      check (status in ('new','accepted','preparing','ready','completed','cancelled')),
  customer_name     text,
  customer_phone    text,
  delivery_address  text,
  delivery_postcode text,
  subtotal          numeric(10,2) not null default 0,
  delivery_fee      numeric(10,2) not null default 0,
  total             numeric(10,2) not null default 0,
  payment_method    text check (payment_method in ('cash','card_on_delivery')),
  requested_time    timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- A line on an order; name and price are snapshots taken at order time.
create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_name    text not null,
  size_name    text,
  options      jsonb not null default '[]',
  quantity     int not null default 1 check (quantity > 0),
  unit_price   numeric(10,2) not null,
  line_total   numeric(10,2) not null,
  notes        text,
  created_at   timestamptz not null default now()
);

-- =========================================================
-- Indexes
-- =========================================================

-- Foreign keys
create index menu_categories_restaurant_id_idx on public.menu_categories (restaurant_id);
create index menu_items_restaurant_id_idx      on public.menu_items (restaurant_id);
create index menu_items_category_id_idx        on public.menu_items (category_id);
create index item_sizes_menu_item_id_idx       on public.item_sizes (menu_item_id);
create index item_options_restaurant_id_idx    on public.item_options (restaurant_id);
create index item_options_menu_item_id_idx     on public.item_options (menu_item_id);
create index item_options_category_id_idx      on public.item_options (category_id);
create index calls_restaurant_id_idx           on public.calls (restaurant_id);
create index orders_restaurant_id_idx          on public.orders (restaurant_id);
create index orders_call_id_idx                on public.orders (call_id);
create index order_items_order_id_idx          on public.order_items (order_id);
create index order_items_menu_item_id_idx      on public.order_items (menu_item_id);

-- Dashboard / list queries
create index orders_restaurant_status_created_idx
  on public.orders (restaurant_id, status, created_at desc);
create index calls_restaurant_started_idx
  on public.calls (restaurant_id, started_at desc);

-- Fuzzy menu-item name matching ("margarita" -> "Margherita")
create index menu_items_name_trgm_idx
  on public.menu_items using gin (name extensions.gin_trgm_ops);

-- =========================================================
-- Triggers
-- =========================================================
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.restaurants     enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items      enable row level security;
alter table public.item_sizes      enable row level security;
alter table public.item_options    enable row level security;
alter table public.calls           enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;

-- Public (anon) read-only access to menu data.
create policy "anon can read restaurants"
  on public.restaurants for select to anon using (true);

create policy "anon can read menu_categories"
  on public.menu_categories for select to anon using (true);

create policy "anon can read menu_items"
  on public.menu_items for select to anon using (true);

create policy "anon can read item_sizes"
  on public.item_sizes for select to anon using (true);

create policy "anon can read item_options"
  on public.item_options for select to anon using (true);

-- calls, orders, order_items: intentionally NO policies.
-- With RLS enabled and no policy, anon/authenticated get nothing;
-- server code uses the service role, which bypasses RLS.
