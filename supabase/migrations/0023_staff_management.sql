-- 0023_staff_management.sql
-- Paste into the Supabase SQL Editor and run once. Safe to run again. Needs 0017.
--
-- P8c: staff management by the owner.
--   1. A third role, 'manager' (owner / manager / staff). What each role may do
--      lives in ONE place in the code: lib/permissions.ts.
--   2. staff_accounts.session_version: written into the login cookie. Changing
--      or resetting a password, switching an account off or changing its role
--      adds 1, so every cookie made before that stops working at once.
--   3. staff_accounts.must_change_password: set when the owner creates an
--      account or resets its password; the user must pick their own password
--      before the rest of the dashboard opens.
--   4. staff_account_events: who did what to which login (no passwords, ever).
--   5. Two functions that make each change and its event row in ONE transaction.
--      Only the server (service_role) may execute them.
-- RLS stays on with no policies: the publishable (anon) key can't see any of it.
-- No table GRANTs (CLAUDE.md). The function GRANTs to service_role are deliberate (as in 0020).

-- 1. Roles.
alter table public.staff_accounts drop constraint if exists staff_accounts_role_check;
alter table public.staff_accounts
  add constraint staff_accounts_role_check check (role in ('owner', 'manager', 'staff'));

-- 2 + 3. New columns (existing logins keep version 1 and need no password change).
alter table public.staff_accounts add column if not exists session_version integer not null default 1;
alter table public.staff_accounts add column if not exists must_change_password boolean not null default false;
alter table public.staff_accounts drop constraint if exists staff_accounts_session_version_check;
alter table public.staff_accounts
  add constraint staff_accounts_session_version_check check (session_version >= 1);

-- 4. Events.
create table if not exists public.staff_account_events (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  actor_staff_id  uuid references public.staff_accounts(id) on delete set null,
  target_staff_id uuid references public.staff_accounts(id) on delete set null,
  event           text not null,
  detail          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  constraint staff_account_events_event_check check (
    event in ('created', 'role_changed', 'deactivated', 'activated', 'password_reset', 'password_changed')
  )
);
create index if not exists staff_account_events_restaurant_created_idx
  on public.staff_account_events (restaurant_id, created_at desc);
alter table public.staff_account_events enable row level security;
-- Deliberately no policies.

-- 5a. The owner's actions on the Staff page.
--   p_action: create | set_role | deactivate | activate | reset_password
--   Returns { ok: true, id, changed } or { ok: false, error }.
--   Errors: not_allowed, not_found, bad_action, bad_username, bad_role,
--           bad_password_hash, username_taken, last_owner, self.
create or replace function public.manage_staff_account_tx(
  p_restaurant_id uuid,
  p_actor_id      uuid,
  p_action        text,
  p_target_id     uuid default null,
  p_username      text default null,
  p_role          text default null,
  p_password_hash text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor  public.staff_accounts%rowtype;
  v_target public.staff_accounts%rowtype;
  v_new_id uuid;
  v_others integer;
begin
  if p_action is null or p_action not in ('create', 'set_role', 'deactivate', 'activate', 'reset_password') then
    return jsonb_build_object('ok', false, 'error', 'bad_action');
  end if;

  -- One staff change at a time per restaurant, so two owners demoting each other
  -- at the same moment cannot leave the restaurant with no owner.
  perform 1 from public.restaurants where id = p_restaurant_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Who is acting: an active owner of THIS restaurant (staff_manage is owner-only).
  select * into v_actor from public.staff_accounts where id = p_actor_id;
  if not found or not v_actor.is_active or v_actor.restaurant_id <> p_restaurant_id or v_actor.role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  if p_role is not null and p_role not in ('owner', 'manager', 'staff') then
    return jsonb_build_object('ok', false, 'error', 'bad_role');
  end if;
  if p_action in ('create', 'reset_password') and (p_password_hash is null or p_password_hash not like 'scrypt$%') then
    return jsonb_build_object('ok', false, 'error', 'bad_password_hash');
  end if;

  if p_action = 'create' then
    if p_username is null or p_username !~ '^[a-z0-9][a-z0-9_-]{2,29}$' then
      return jsonb_build_object('ok', false, 'error', 'bad_username');
    end if;
    if p_role is null then
      return jsonb_build_object('ok', false, 'error', 'bad_role');
    end if;
    begin
      insert into public.staff_accounts (restaurant_id, username, password_hash, role, must_change_password)
      values (p_restaurant_id, p_username, p_password_hash, p_role, true)
      returning id into v_new_id;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'username_taken');
    end;
    insert into public.staff_account_events (restaurant_id, actor_staff_id, target_staff_id, event, detail)
    values (p_restaurant_id, p_actor_id, v_new_id, 'created', jsonb_build_object('username', p_username, 'role', p_role));
    return jsonb_build_object('ok', true, 'id', v_new_id, 'changed', true);
  end if;

  -- Every other action works on an existing login of THIS restaurant only.
  select * into v_target from public.staff_accounts
   where id = p_target_id and restaurant_id = p_restaurant_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- The last active owner can never be demoted or switched off.
  if v_target.role = 'owner' and v_target.is_active
     and (p_action = 'deactivate' or (p_action = 'set_role' and p_role is distinct from 'owner')) then
    select count(*) into v_others from public.staff_accounts
     where restaurant_id = p_restaurant_id and role = 'owner' and is_active and id <> v_target.id;
    if v_others = 0 then
      return jsonb_build_object('ok', false, 'error', 'last_owner');
    end if;
  end if;

  -- An owner can't change their own role, switch themselves off or reset their
  -- own password here (their own password is changed on the Password page).
  if v_target.id = v_actor.id then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;

  if p_action = 'set_role' then
    if p_role is null then
      return jsonb_build_object('ok', false, 'error', 'bad_role');
    end if;
    if p_role = v_target.role then
      return jsonb_build_object('ok', true, 'id', v_target.id, 'changed', false);
    end if;
    update public.staff_accounts
       set role = p_role, session_version = session_version + 1
     where id = v_target.id;
    insert into public.staff_account_events (restaurant_id, actor_staff_id, target_staff_id, event, detail)
    values (p_restaurant_id, p_actor_id, v_target.id, 'role_changed',
            jsonb_build_object('username', v_target.username, 'from', v_target.role, 'to', p_role));

  elsif p_action = 'deactivate' then
    if not v_target.is_active then
      return jsonb_build_object('ok', true, 'id', v_target.id, 'changed', false);
    end if;
    update public.staff_accounts
       set is_active = false, session_version = session_version + 1
     where id = v_target.id;
    insert into public.staff_account_events (restaurant_id, actor_staff_id, target_staff_id, event, detail)
    values (p_restaurant_id, p_actor_id, v_target.id, 'deactivated', jsonb_build_object('username', v_target.username));

  elsif p_action = 'activate' then
    if v_target.is_active then
      return jsonb_build_object('ok', true, 'id', v_target.id, 'changed', false);
    end if;
    update public.staff_accounts set is_active = true where id = v_target.id;
    insert into public.staff_account_events (restaurant_id, actor_staff_id, target_staff_id, event, detail)
    values (p_restaurant_id, p_actor_id, v_target.id, 'activated', jsonb_build_object('username', v_target.username));

  elsif p_action = 'reset_password' then
    -- A reset also lifts a login lock, so the person can sign in with the new password straight away.
    update public.staff_accounts
       set password_hash = p_password_hash,
           must_change_password = true,
           session_version = session_version + 1,
           failed_attempts = 0,
           locked_until = null
     where id = v_target.id;
    insert into public.staff_account_events (restaurant_id, actor_staff_id, target_staff_id, event, detail)
    values (p_restaurant_id, p_actor_id, v_target.id, 'password_reset', jsonb_build_object('username', v_target.username));
  end if;

  return jsonb_build_object('ok', true, 'id', v_target.id, 'changed', true);
end;
$$;

-- 5b. Any logged-in user changing their OWN password.
--   p_expected_hash: the hash the server checked the old password against. If it
--   changed in the meantime (a reset), nothing is saved ('stale').
--   Returns { ok: true, session_version } or { ok: false, error }.
create or replace function public.change_own_password_tx(
  p_restaurant_id uuid,
  p_staff_id      uuid,
  p_expected_hash text,
  p_new_hash      text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.staff_accounts%rowtype;
  v_version integer;
begin
  select * into v_row from public.staff_accounts where id = p_staff_id for update;
  if not found or not v_row.is_active or v_row.restaurant_id <> p_restaurant_id then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_new_hash is null or p_new_hash not like 'scrypt$%' then
    return jsonb_build_object('ok', false, 'error', 'bad_password_hash');
  end if;
  if v_row.password_hash is distinct from p_expected_hash then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;

  update public.staff_accounts
     set password_hash = p_new_hash,
         must_change_password = false,
         session_version = session_version + 1
   where id = p_staff_id
  returning session_version into v_version;

  insert into public.staff_account_events (restaurant_id, actor_staff_id, target_staff_id, event, detail)
  values (p_restaurant_id, p_staff_id, p_staff_id, 'password_changed', jsonb_build_object('username', v_row.username));

  return jsonb_build_object('ok', true, 'session_version', v_version);
end;
$$;

-- Only the server (service key) calls these. Not the browser's anon / logged-in roles.
revoke execute on function public.manage_staff_account_tx(uuid, uuid, text, uuid, text, text, text) from public, anon, authenticated;
grant  execute on function public.manage_staff_account_tx(uuid, uuid, text, uuid, text, text, text) to service_role;
revoke execute on function public.change_own_password_tx(uuid, uuid, text, text) from public, anon, authenticated;
grant  execute on function public.change_own_password_tx(uuid, uuid, text, text) to service_role;
