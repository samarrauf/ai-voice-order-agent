-- 0017_staff_accounts.sql
-- One row per staff login. Each login belongs to exactly ONE restaurant, and
-- the dashboard always takes the restaurant from the logged-in account (never
-- from what the browser sends).
--
-- Only a password HASH is stored (scrypt, see lib/passwords.ts), never the
-- password itself. failed_attempts + locked_until give the login lock-out
-- (5 wrong passwords -> locked for 15 minutes).
--
-- RLS is ON with NO policies: the publishable (anon) key can't read or change
-- anything here. Only the server (service role) uses this table.
-- Nothing existing is changed. No GRANT statements (see CLAUDE.md).

create table if not exists public.staff_accounts (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  username        text not null,
  password_hash   text not null,
  role            text not null,
  is_active       boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),

  constraint staff_accounts_username_key unique (username),
  -- Always stored in lower case, so "Napoli-Owner" and "napoli-owner" are the same login.
  constraint staff_accounts_username_lowercase check (username = lower(username)),
  constraint staff_accounts_username_format check (username ~ '^[a-z0-9][a-z0-9._-]{2,49}$'),
  constraint staff_accounts_role_check check (role in ('owner', 'staff')),
  constraint staff_accounts_failed_attempts_check check (failed_attempts >= 0),
  -- A safety net: a plain-text password can never be saved by mistake.
  constraint staff_accounts_password_hash_format check (password_hash like 'scrypt$%')
);

create index if not exists staff_accounts_restaurant_id_idx on public.staff_accounts (restaurant_id);

alter table public.staff_accounts enable row level security;
-- Deliberately no policies.
