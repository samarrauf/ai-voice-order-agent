-- 0003_create_order_rpc.sql — atomic order creation.
-- Paste into the Supabase SQL Editor and run once. Requires 0001_init.sql.
--
-- Inserts one order and all of its order_items inside a single transaction
-- (a Postgres function call is always atomic), so a partial order — an order
-- row with missing items — is impossible. If any insert fails, everything rolls back.
--
-- Prices here were already calculated server-side by /api/tools/create-order
-- from the menu tables. This function just stores them; it never receives
-- anything typed by the voice agent's price guesses.
--
-- security invoker (the default): it runs with the caller's rights. Only the
-- service role (which bypasses RLS) can insert into orders, so anon calling
-- this via PostgREST gets an RLS error and nothing is written.

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
    payment_method, notes
  )
  values (
    (p_order->>'restaurant_id')::uuid,
    -- Only link the call if it really exists; a bad call id must never lose an order.
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
    p_order->>'notes'
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
