-- 0018_settings_audit.sql
-- P8b: Settings page. Paste into the Supabase SQL Editor and run once.
--
-- 1. settings_audit: one row every time an owner saves Settings, recording
--    who, when, which section, and the old/new value of each changed field.
--    RLS is ON with NO policies: only the server (service role) touches it.
-- 2. Two safety checks on restaurants so a typo in Settings can never save a
--    negative delivery fee or minimum order. Existing rows already satisfy them.
-- No GRANT statements (CLAUDE.md rule 8).

create table if not exists public.settings_audit (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  staff_id       uuid references public.staff_accounts(id) on delete set null,
  username       text not null,
  section        text not null,
  changes        jsonb not null,
  created_at     timestamptz not null default now()
);

create index if not exists settings_audit_restaurant_created_idx
  on public.settings_audit (restaurant_id, created_at desc);

alter table public.settings_audit enable row level security;
-- Deliberately no policies.

alter table public.restaurants drop constraint if exists restaurants_delivery_fee_nonneg;
alter table public.restaurants
  add constraint restaurants_delivery_fee_nonneg check (delivery_fee is null or delivery_fee >= 0);

alter table public.restaurants drop constraint if exists restaurants_min_order_nonneg;
alter table public.restaurants
  add constraint restaurants_min_order_nonneg check (min_order_value is null or min_order_value >= 0);
