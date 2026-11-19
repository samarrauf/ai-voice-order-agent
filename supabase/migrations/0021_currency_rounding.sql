-- 0021_currency_rounding.sql
-- P9a-A: a rounding step for cash-friendly totals (e.g. whole rupees in PKR).
-- Paste into the Supabase SQL Editor and run once. Safe to run again. Needs 0001 to 0020.
--
-- 1. restaurants.rounding_step: 0.01 (default = no rounding, exactly as today),
--    0.5 or 1. Napoli stays at 0.01, so nothing changes for it.
-- 2. orders.rounding_amount: how much rounding was added to (or taken off) the
--    bill. Old orders get 0. The rule for every order is:
--      subtotal - discount_amount + delivery_fee + service_charge_amount
--        + tax_amount + rounding_amount = total
-- 3. create_order_tx now saves rounding_amount AND checks that rule, so a wrong
--    total can never be written to the database by any bug (the order is
--    refused and nothing is saved). Everything else in the function is exactly
--    as in 0014 (including "a zero total is born paid").
-- 4. create_order_tx is for the server (service key) only: anon and
--    authenticated lose EXECUTE, same as update_restaurant_settings_tx (0020).
--    (The GRANT is on this one function, to service_role only; no table grants.)
-- RLS is unchanged (on, as before).

-- ---------- 1. restaurants.rounding_step ----------
alter table public.restaurants
  add column if not exists rounding_step numeric(4,2) not null default 0.01;

alter table public.restaurants drop constraint if exists restaurants_rounding_step_check;
alter table public.restaurants
  add constraint restaurants_rounding_step_check check (rounding_step in (0.01, 0.5, 1));

-- ---------- 2. orders.rounding_amount ----------
alter table public.orders
  add column if not exists rounding_amount numeric(10,2) not null default 0;

-- ---------- 3. create_order_tx ----------
create or replace function public.create_order_tx(p_order jsonb, p_items jsonb)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders;
  v_parts numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'create_order_tx: an order needs at least one item';
  end if;

  -- The total must be exactly the parts plus the rounding. A wrong total is refused, never saved.
  v_parts := coalesce((p_order->>'subtotal')::numeric, 0)
           - coalesce((p_order->>'discount_amount')::numeric, 0)
           + coalesce((p_order->>'delivery_fee')::numeric, 0)
           + coalesce((p_order->>'service_charge_amount')::numeric, 0)
           + coalesce((p_order->>'tax_amount')::numeric, 0)
           + coalesce((p_order->>'rounding_amount')::numeric, 0);
  if (p_order->>'total') is null or round(v_parts, 2) <> round((p_order->>'total')::numeric, 2) then
    raise exception 'create_order_tx: total % does not equal subtotal - discount + delivery + service + tax + rounding (%)',
      p_order->>'total', v_parts;
  end if;

  insert into public.orders (
    restaurant_id, call_id, fulfilment_type, customer_name, customer_phone,
    delivery_address, delivery_postcode, subtotal, delivery_fee, total,
    payment_method, requested_time, notes, source, table_session_id,
    discount_type, discount_value, discount_amount, discount_reason,
    service_charge_amount, tax_amount, rounding_amount, payment_status
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
    coalesce((p_order->>'tax_amount')::numeric, 0),
    coalesce((p_order->>'rounding_amount')::numeric, 0),
    -- A 100% discount makes the total 0: nothing to collect, so it is born paid.
    case when (p_order->>'total')::numeric = 0 then 'paid' else 'unpaid' end
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

-- ---------- 4. who may call it ----------
revoke execute on function public.create_order_tx(jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.create_order_tx(jsonb, jsonb) to service_role;
