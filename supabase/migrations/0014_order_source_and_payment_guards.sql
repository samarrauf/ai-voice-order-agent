-- 0014_order_source_and_payment_guards.sql — small P2a guards.
-- Paste into the Supabase SQL Editor and run once. Requires 0001 to 0013.
-- Safe to run again (idempotent).
--
-- 1. orders.source accepts a new value 'staff_phone' (staff typing in a
--    delivery order taken over the phone). The old values stay allowed.
-- 2. create_order_tx: an order whose total is 0 (100% discount) is created
--    as payment_status 'paid'. Old zero-total orders still marked unpaid are fixed.
-- 3. orders: CHECK (paid_amount >= 0 and paid_amount <= total). If any existing
--    row breaks it, the constraint is added NOT VALID (applies to new/changed
--    rows only) and a NOTICE says so.
--
-- Results are printed as NOTICE messages (Supabase shows them under "Results").
-- No GRANT statements — CLAUDE.md rule 8.

-- ---------- 1. orders.source: add 'staff_phone' ----------
do $$
declare
  v_name text;
begin
  -- Find and drop whatever CHECK constraint currently guards orders.source.
  for v_name in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.orders'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%source%'
       and c.conname <> 'orders_source_allowed'
  loop
    execute format('alter table public.orders drop constraint %I', v_name);
    raise notice 'dropped old source constraint: %', v_name;
  end loop;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.orders'::regclass and conname = 'orders_source_allowed'
  ) then
    alter table public.orders
      add constraint orders_source_allowed
      check (source in ('phone', 'table_booking', 'walk_in', 'staff_phone'));
  end if;
end
$$;

-- ---------- 2. zero-total orders are paid ----------
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
    service_charge_amount, tax_amount, payment_status
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


do $$
declare
  v_fixed int;
begin
  update public.orders
     set payment_status = 'paid'
   where total = 0 and payment_status <> 'paid';
  get diagnostics v_fixed = row_count;
  raise notice 'old zero-total orders fixed to paid: %', v_fixed;
end
$$;

-- ---------- 3. paid_amount guard ----------
do $$
declare
  v_bad int;
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.orders'::regclass and conname = 'orders_paid_amount_within_total'
  ) then
    raise notice 'orders_paid_amount_within_total already exists, skipped';
    return;
  end if;

  select count(*) into v_bad
    from public.orders
   where paid_amount < 0 or paid_amount > total;

  if v_bad = 0 then
    alter table public.orders
      add constraint orders_paid_amount_within_total
      check (paid_amount >= 0 and paid_amount <= total);
    raise notice 'paid_amount constraint added (all rows valid)';
  else
    alter table public.orders
      add constraint orders_paid_amount_within_total
      check (paid_amount >= 0 and paid_amount <= total) not valid;
    raise notice 'paid_amount constraint added NOT VALID: % existing rows break it', v_bad;
  end if;
end
$$;
