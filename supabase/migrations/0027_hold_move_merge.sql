-- 0027_hold_move_merge.sql — B4a: hold/resume, move a table, merge two orders.
-- Paste into the Supabase SQL Editor and run once. Needs 0008, 0009, 0013, 0017, 0025.
--
-- 1. held_carts: a POS cart a staff member put aside to finish later.
-- 2. order_events: one row per thing that happened to an order (moved, merged,
--    later: items added, voided, ...). Written ONLY by the server.
-- 3. orders.status: 'merged' is now allowed (the source order of a merge).
-- 4. move_table_tx: moves an open table session to another free table, atomically.
-- 5. merge_orders_tx: joins two open dine-in orders into one, atomically.
-- 6. record_payment_tx: same as 0013 plus a refusal for a merged order.
--
-- RLS is on and there are NO policies: only the service role (server code) can
-- touch these tables. The new functions are callable by service_role only.
-- No GRANT statements on tables — see CLAUDE.md rule 2.

-- ---------- 1. held carts ----------
create table public.held_carts (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  staff_id          uuid references public.staff_accounts(id) on delete set null,
  label             text not null check (char_length(label) between 1 and 60),
  table_session_id  uuid references public.table_sessions(id) on delete set null,
  cart              jsonb not null,
  created_at        timestamptz not null default now()
);
create index held_carts_restaurant_idx on public.held_carts (restaurant_id, created_at desc);
alter table public.held_carts enable row level security;

-- ---------- 2. order events ----------
create table public.order_events (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  order_id       uuid not null references public.orders(id) on delete cascade,
  staff_id       uuid references public.staff_accounts(id) on delete set null,
  event          text not null,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);
create index order_events_restaurant_idx on public.order_events (restaurant_id, created_at desc);
alter table public.order_events enable row level security;

-- ---------- 3. 'merged' order status ----------
-- Drop whatever check constraint currently limits orders.status (by its definition, not its name).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.orders'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%status%'
       and pg_get_constraintdef(oid) like '%cancelled%'
       and pg_get_constraintdef(oid) not like '%payment_status%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.orders
  add constraint orders_status_check
  check (status in ('new','accepted','preparing','ready','completed','cancelled','merged'));

-- ---------- 4. move_table_tx ----------
-- Returns jsonb: {"ok": true, "from_table", "to_table", "seats", "party_size", "seats_warning"}
-- or {"ok": false, "error": "session_not_found" | "table_not_found" | "same_table" | "table_busy"}.
create or replace function public.move_table_tx(
  p_restaurant_id uuid,
  p_staff_id      uuid,
  p_session_id    uuid,
  p_to_table_id   uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.table_sessions;
  v_from    text;
  v_to      public.restaurant_tables;
begin
  -- Lock the session: two staff moving the same table wait for each other.
  select * into v_session
    from public.table_sessions
   where id = p_session_id and restaurant_id = p_restaurant_id and cleared_at is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'session_not_found');
  end if;

  select * into v_to
    from public.restaurant_tables
   where id = p_to_table_id and restaurant_id = p_restaurant_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'table_not_found');
  end if;
  if v_to.id = v_session.table_id then
    return jsonb_build_object('ok', false, 'error', 'same_table');
  end if;

  select table_number into v_from from public.restaurant_tables where id = v_session.table_id;

  begin
    -- table_sessions_one_open_per_table (0009) rejects a table that is already occupied.
    update public.table_sessions set table_id = v_to.id where id = v_session.id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'table_busy');
  end;

  insert into public.order_events (restaurant_id, order_id, staff_id, event, detail)
  select o.restaurant_id, o.id, p_staff_id, 'table_moved',
         jsonb_build_object('from_table', v_from, 'to_table', v_to.table_number,
                            'seats', v_to.seats, 'party_size', v_session.party_size)
    from public.orders o
   where o.table_session_id = v_session.id and o.status not in ('cancelled', 'merged');

  return jsonb_build_object(
    'ok', true, 'from_table', v_from, 'to_table', v_to.table_number,
    'seats', v_to.seats, 'party_size', v_session.party_size,
    'seats_warning', v_to.seats < v_session.party_size
  );
end;
$$;

revoke execute on function public.move_table_tx(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function public.move_table_tx(uuid, uuid, uuid, uuid) to service_role;

-- ---------- 5. merge_orders_tx ----------
-- The server worked out the new bill (computeBill) from the two orders' items; this
-- function locks both orders, checks nothing changed (p_expected_subtotal) and then
-- moves the items and writes the numbers. p_bill: subtotal, discount_amount,
-- service_charge_amount, tax_amount, rounding_amount, total.
-- Returns {"ok": true, ...} or {"ok": false, "error": "order_not_found" | "same_order" |
-- "not_dine_in" | "order_closed" | "already_paid" | "changed" | "bad_bill"}.
create or replace function public.merge_orders_tx(
  p_restaurant_id     uuid,
  p_staff_id          uuid,
  p_source_id         uuid,
  p_target_id         uuid,
  p_expected_subtotal numeric,
  p_bill              jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_src      public.orders;
  v_tgt      public.orders;
  v_open     int;
  v_sum      numeric;
  v_moved    int;
  v_cleared  boolean := false;
  r          record;
begin
  if p_source_id = p_target_id then
    return jsonb_build_object('ok', false, 'error', 'same_order');
  end if;

  -- Lock both rows, always in id order, so two merges can't deadlock.
  perform 1 from public.orders
   where id in (p_source_id, p_target_id) and restaurant_id = p_restaurant_id
   order by id for update;

  select * into v_src from public.orders where id = p_source_id and restaurant_id = p_restaurant_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'order_not_found'); end if;
  select * into v_tgt from public.orders where id = p_target_id and restaurant_id = p_restaurant_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'order_not_found'); end if;

  for r in select o.id, o.status, o.table_session_id, o.paid_amount, o.payment_status
             from public.orders o where o.id in (v_src.id, v_tgt.id)
  loop
    if r.table_session_id is null then
      return jsonb_build_object('ok', false, 'error', 'not_dine_in');
    end if;
    if not exists (select 1 from public.table_sessions s where s.id = r.table_session_id and s.cleared_at is null) then
      return jsonb_build_object('ok', false, 'error', 'order_closed');
    end if;
    if r.status in ('cancelled', 'completed', 'merged') then
      return jsonb_build_object('ok', false, 'error', 'order_closed');
    end if;
    if r.paid_amount > 0 or r.payment_status <> 'unpaid'
       or exists (select 1 from public.order_payments p where p.order_id = r.id) then
      return jsonb_build_object('ok', false, 'error', 'already_paid');
    end if;
  end loop;

  select coalesce(sum(line_total), 0) into v_sum
    from public.order_items where order_id in (v_src.id, v_tgt.id);
  if v_sum <> p_expected_subtotal or (p_bill->>'subtotal')::numeric <> v_sum then
    return jsonb_build_object('ok', false, 'error', 'changed');
  end if;
  -- Same rule as create_order_tx: the parts must add up to the total.
  if (p_bill->>'subtotal')::numeric - (p_bill->>'discount_amount')::numeric
     + (p_bill->>'service_charge_amount')::numeric + (p_bill->>'tax_amount')::numeric
     + (p_bill->>'rounding_amount')::numeric <> (p_bill->>'total')::numeric then
    return jsonb_build_object('ok', false, 'error', 'bad_bill');
  end if;

  update public.order_items set order_id = v_tgt.id where order_id = v_src.id;
  get diagnostics v_moved = row_count;

  update public.orders o
     set subtotal              = (p_bill->>'subtotal')::numeric,
         discount_amount       = (p_bill->>'discount_amount')::numeric,
         service_charge_amount = (p_bill->>'service_charge_amount')::numeric,
         tax_amount            = (p_bill->>'tax_amount')::numeric,
         rounding_amount       = (p_bill->>'rounding_amount')::numeric,
         total                 = (p_bill->>'total')::numeric,
         cost_total            = s.total,
         cost_complete         = s.complete
    from (
      select coalesce(sum(oi.line_cost), 0) as total, coalesce(bool_and(oi.unit_cost is not null), true) as complete
        from public.order_items oi where oi.order_id = v_tgt.id
    ) as s
   where o.id = v_tgt.id;

  -- The source order is kept for the record but carries no money any more.
  update public.orders
     set status = 'merged', subtotal = 0, discount_type = 'none', discount_value = 0, discount_amount = 0,
         delivery_fee = 0, service_charge_amount = 0, tax_amount = 0, rounding_amount = 0, total = 0,
         cost_total = 0, cost_complete = true
   where id = v_src.id;

  -- The source table is free again once it has no live order left.
  if v_src.table_session_id <> v_tgt.table_session_id then
    select count(*) into v_open from public.orders
     where table_session_id = v_src.table_session_id and status not in ('cancelled', 'merged');
    if v_open = 0 then
      update public.table_sessions set cleared_at = now() where id = v_src.table_session_id and cleared_at is null;
      v_cleared := true;
    end if;
  end if;

  insert into public.order_events (restaurant_id, order_id, staff_id, event, detail) values
    (p_restaurant_id, v_tgt.id, p_staff_id, 'merged_in',
      jsonb_build_object('source_order_id', v_src.id, 'source_order_number', v_src.order_number,
                         'items_moved', v_moved, 'old_total', v_tgt.total, 'source_total', v_src.total,
                         'new_total', (p_bill->>'total')::numeric)),
    (p_restaurant_id, v_src.id, p_staff_id, 'merged_into',
      jsonb_build_object('target_order_id', v_tgt.id, 'target_order_number', v_tgt.order_number,
                         'original_total', v_src.total, 'table_cleared', v_cleared));

  return jsonb_build_object(
    'ok', true, 'target_order_id', v_tgt.id, 'target_order_number', v_tgt.order_number,
    'source_order_number', v_src.order_number, 'items_moved', v_moved,
    'total', (p_bill->>'total')::numeric, 'source_table_cleared', v_cleared
  );
end;
$$;

revoke execute on function public.merge_orders_tx(uuid, uuid, uuid, uuid, numeric, jsonb) from public, anon, authenticated;
grant  execute on function public.merge_orders_tx(uuid, uuid, uuid, uuid, numeric, jsonb) to service_role;

-- ---------- 6. record_payment_tx: refuse a merged order ----------
-- Same function as 0013, plus the 'merged' check (error code order_merged).
create or replace function public.record_payment_tx(
  p_restaurant_id   uuid,
  p_order_id        uuid,
  p_method          text,
  p_amount          numeric,
  p_reference       text,
  p_created_by      text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order  public.orders;
  v_paid   numeric(10,2);
  v_status text;
begin
  select * into v_order
    from public.orders
   where id = p_order_id and restaurant_id = p_restaurant_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  if p_idempotency_key is not null and exists (
    select 1 from public.order_payments
     where order_id = p_order_id and idempotency_key = p_idempotency_key
  ) then
    return jsonb_build_object(
      'ok', true, 'duplicate', true,
      'payment_status', v_order.payment_status, 'paid_amount', v_order.paid_amount,
      'total', v_order.total, 'balance', v_order.total - v_order.paid_amount
    );
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'order_cancelled');
  end if;
  if v_order.status = 'merged' then
    return jsonb_build_object('ok', false, 'error', 'order_merged');
  end if;
  if v_order.paid_amount >= v_order.total then
    return jsonb_build_object('ok', false, 'error', 'already_paid');
  end if;
  if v_order.paid_amount + p_amount > v_order.total then
    return jsonb_build_object('ok', false, 'error', 'overpayment');
  end if;

  insert into public.order_payments
    (restaurant_id, order_id, method, amount, reference, created_by, idempotency_key)
  values
    (p_restaurant_id, p_order_id, p_method, p_amount, p_reference, p_created_by, p_idempotency_key);

  v_paid := v_order.paid_amount + p_amount;
  v_status := case when v_paid >= v_order.total then 'paid' else 'partial' end;

  update public.orders
     set paid_amount = v_paid, payment_status = v_status
   where id = p_order_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false,
    'payment_status', v_status, 'paid_amount', v_paid,
    'total', v_order.total, 'balance', v_order.total - v_paid
  );
end;
$$;

revoke execute on function public.record_payment_tx(uuid, uuid, text, numeric, text, text, text) from public, anon, authenticated;
grant  execute on function public.record_payment_tx(uuid, uuid, text, numeric, text, text, text) to service_role;
