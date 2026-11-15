-- 0009_table_session_safety.sql — two safety fixes for the POS (Phase 3b).
-- Paste into the Supabase SQL Editor and run once. Requires 0008.
--
-- 1. A table can have only ONE open session (cleared_at is null) at a time.
--    The database itself now enforces this, so two staff pressing "seat" at
--    the same moment can't both succeed — the second insert is rejected.
-- 2. create_order_tx now saves table_session_id in the SAME insert as the
--    order, so a dine-in order and its table link are saved together or not
--    at all (before, the link was a separate step that could fail).
--
-- No GRANT statements — see CLAUDE.md rule 8. RLS settings are unchanged.

create unique index table_sessions_one_open_per_table
  on public.table_sessions (table_id)
  where cleared_at is null;

-- Same function as 0008, plus the `table_session_id` column.
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
    payment_method, requested_time, notes, source, table_session_id
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
    (p_order->>'requested_time')::timestamptz,
    p_order->>'notes',
    coalesce(p_order->>'source', 'phone'),
    -- Null for phone orders. A bad id fails the foreign key and rolls everything back.
    (p_order->>'table_session_id')::uuid
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
