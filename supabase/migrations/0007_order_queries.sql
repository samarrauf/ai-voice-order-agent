-- 0007_order_queries.sql — refund / change / complaint requests about past orders.
-- Paste into the Supabase SQL Editor and run once. Requires 0001_init.sql
-- (restaurants, orders, set_updated_at).
--
-- BUSINESS RULE: the system never decides anything (no refund, discount or
-- order change). A row here is only a record of what the caller said, with a
-- reference number, for the owner/staff to act on.

-- Human-friendly references: Q-3001, Q-3002, ...
create sequence if not exists public.query_reference_seq start with 3001 increment by 1;

create or replace function public.generate_query_reference()
returns text
language sql
set search_path = ''
as $$
  select 'Q-' || nextval('public.query_reference_seq')::text;
$$;

create table public.order_queries (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete restrict,
  order_id         uuid not null references public.orders(id) on delete cascade,
  reference_number text not null unique default public.generate_query_reference(),
  query_type       text not null check (query_type in ('refund', 'change', 'complaint')),
  description      text not null,
  -- 'new' for now; staff/POS can set 'resolved' later.
  status           text not null default 'new',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index order_queries_restaurant_id_idx on public.order_queries (restaurant_id);
create index order_queries_order_id_idx      on public.order_queries (order_id);

create trigger order_queries_set_updated_at
  before update on public.order_queries
  for each row execute function public.set_updated_at();

-- RLS on, NO policies: service role only (like orders and bookings).
-- Caller phone numbers and complaints must never be readable with the public key.
-- No GRANT statements (see CLAUDE.md).
alter table public.order_queries enable row level security;
