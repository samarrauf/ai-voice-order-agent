-- 0013_pos_payments_and_charges.sql — bill charges and payments for the POS (P2a).
-- Paste into the Supabase SQL Editor and run once. Requires 0001 to 0012.
--
-- 1. restaurants: the settings that decide the extra charges. Everything
--    defaults to 0 / off, so nothing changes until the owner sets a value.
--    (Delivery fee is NOT added here: restaurants.delivery_fee already exists.)
-- 2. orders: the breakdown of the bill (discount, service charge, tax) and
--    whether it has been paid. Old orders get safe defaults: no discount,
--    no extra charges, 'unpaid'. (orders.delivery_fee already exists too.)
-- 3. order_payments: one row per payment, so an order can be paid in several
--    parts (split payment). `idempotency_key` stops a double click from
--    recording the same payment twice.
-- 4. create_order_tx now also saves the new bill columns.
-- 5. record_payment_tx: records a payment atomically (locks the order row, so
--    two payments at the same moment can never add up to more than the total).
--
-- All money is numeric(10,2) pounds, same as the rest of the schema.
-- RLS is on and there are NO policies: only the service role (server code)
-- can touch the new table, same as orders. No GRANT statements — CLAUDE.md rule 8.

-- ---------- 1. restaurant settings ----------
alter table public.restaurants
  add column tax_rate_percent         numeric(5,2) not null default 0
    check (tax_rate_percent between 0 and 100),
  add column service_charge_percent   numeric(5,2) not null default 0
    check (service_charge_percent between 0 and 100),
  add column service_charge_applies_to text not null default 'none'
    check (service_charge_applies_to in ('dine_in', 'all', 'none')),
  add column max_discount_percent     numeric(5,2) not null default 0
    check (max_discount_percent between 0 and 100);

-- ---------- 2. order bill columns ----------
alter table public.orders
  add column discount_type          text not null default 'none'
    check (discount_type in ('none', 'percent', 'fixed')),
  add column discount_value         numeric(10,2) not null default 0 check (discount_value >= 0),
  add column discount_amount        numeric(10,2) not null default 0 check (discount_amount >= 0),
  add column discount_reason        text,
  add column service_charge_amount  numeric(10,2) not null default 0 check (service_charge_amount >= 0),
  add column tax_amount             numeric(10,2) not null default 0 check (tax_amount >= 0),
  add column payment_status         text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partial', 'paid')),
  add column paid_amount            numeric(10,2) not null default 0 check (paid_amount >= 0);

-- ---------- 3. payments ----------
create table public.order_payments (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  order_id        uuid not null references public.orders(id) on delete cascade,
  method          text not null check (method in ('cash', 'card', 'online', 'other')),
  amount          numeric(10,2) not null check (amount > 0),
  reference       text,
  created_by      text,
  idempotency_key text,
  created_at      timestamptz not null default now()
);

create index order_payments_order_idx on public.order_payments (order_id);
create index order_payments_restaurant_idx on public.order_payments (restaurant_id, created_at desc);

-- The same key can't be used twice on the same order (NULL keys are exempt).
create unique index order_payments_idempotency_idx
  on public.order_payments (order_id, idempotency_key)
  where idempotency_key is not null;

alter table public.order_payments enable row level security;

-- ---------- 4. create_order_tx: same as 0009, plus the bill columns ----------
create or replace function public.create_order_tx(p_order jsonb, p_items jsonb)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'create_order_tx: an order needs at least one item';
  end if;

  insert into public.orders (
    restaurant_id, call_id, fulfilment_type, customer_name, customer_phone,
    delivery_address, delivery_postcode, subtotal, delivery_fee, total,
    payment_method, requested_time, notes, source, table_session_id,
    discount_type, discount_value, discount_amount, discount_reason,
    service_charge_amount, tax_amount
  )
  values (
    (p_order->>'restaurant_id')::uuid,
    (select c.id from public.calls c where c.id::text = p_order->>'call_id'),
    p_order->>'fulfilment_type',
    p_order->>'customer_name',
    p_order->>'customer_phone',
    p_order->>'delivery_address',
    p_order->>'delivery_postcode',
    (p_order->>'subtotal')::numeric,
    (p_order->>'delivery_fee')::numeric,
    (p_order->>'total')::numeric,
    p_order->>'payment_method',
    (p_order->>'requested_time')::timestamptz,
    p_order->>'notes',
    coalesce(p_order->>'source', 'phone'),
    (p_order->>'table_session_id')::uuid,
    coalesce(p_order->>'discount_type', 'none'),
    coalesce((p_order->>'discount_value')::numeric, 0),
    coalesce((p_order->>'discount_amount')::numeric, 0),
    p_order->>'discount_reason',
    coalesce((p_order->>'service_charge_amount')::numeric, 0),
    coalesce((p_order->>'tax_amount')::numeric, 0)
  )
  returning * into v_order;

  insert into public.order_items (
    order_id, menu_item_id, item_name, size_name, options, quantity,
    unit_price, line_total, notes
  )
  select
    v_order.id,
    i.menu_item_id,
    i.item_name,
    i.size_name,
    coalesce(i.options, '[]'::jsonb),
    i.quantity,
    i.unit_price,
    i.line_total,
    i.notes
  from jsonb_to_recordset(p_items) as i(
    menu_item_id uuid,
    item_name    text,
    size_name    text,
    options      jsonb,
    quantity     int,
    unit_price   numeric,
    line_total   numeric,
    notes        text
  );

  return v_order;
end;
$$;

-- ---------- 5. record_payment_tx ----------
-- Returns jsonb: {"ok": true, "duplicate": bool, "payment_status", "paid_amount",
-- "total", "balance"} or {"ok": false, "error": "<code>"} where code is one of
-- order_not_found | order_cancelled | overpayment | already_paid.
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
  -- Lock the order row: a second payment on the same order waits here.
  select * into v_order
    from public.orders
   where id = p_order_id and restaurant_id = p_restaurant_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  -- Same key seen before on this order: answer with the current state, add nothing.
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
