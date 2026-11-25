-- 0028_add_items_to_order.sql — B4a2: add items to a running dine-in order.
-- Paste into the Supabase SQL Editor and run once. Needs 0025 (cost snapshot) and 0027 (order_events).
--
-- 1. orders.items_added_at: when items were last added to a running order
--    (the Orders board shows a small "new items" mark from it).
-- 2. add_items_tx: adds items to ONE open dine-in order, atomically.
--
-- No new tables, no new policies. The function is callable by service_role only.
-- No GRANT statements on tables — see CLAUDE.md rule 2.

alter table public.orders add column if not exists items_added_at timestamptz;

-- The server priced the new items from the menu (priceLines) and worked out the whole new
-- bill (computeBill) from the old items + the new ones. This function locks the order,
-- checks nothing changed since the server read it (p_expected_subtotal), then writes the new
-- items WITH their cost snapshot (same order_line_unit_cost as create_order_tx; the cost is
-- never taken from p_items) and the new money numbers. Earlier items are never touched.
--
-- p_items: same shape as create_order_tx (menu_item_id, item_name, size_name, options,
--          quantity, unit_price, line_total, notes).
-- p_bill:  subtotal, discount_amount, service_charge_amount, tax_amount, rounding_amount, total.
-- Returns {"ok": true, ...} or {"ok": false, "error": "order_not_found" | "not_dine_in" |
-- "order_closed" | "already_paid" | "changed" | "bad_bill"}.
create or replace function public.add_items_to_order_tx(
  p_restaurant_id     uuid,
  p_staff_id          uuid,
  p_order_id          uuid,
  p_items             jsonb,
  p_expected_subtotal numeric,
  p_bill              jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order   public.orders;
  v_old_sum numeric;
  v_new_sum numeric;
  v_status  text;
  v_ids     uuid[];
  v_event   uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'add_items_to_order_tx: needs at least one item';
  end if;

  -- Lock the order: two staff adding at the same moment wait for each other.
  select * into v_order from public.orders
   where id = p_order_id and restaurant_id = p_restaurant_id
   for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'order_not_found'); end if;

  if v_order.table_session_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_dine_in');
  end if;
  if not exists (select 1 from public.table_sessions s where s.id = v_order.table_session_id and s.cleared_at is null)
     or v_order.status in ('cancelled', 'completed', 'merged') then
    return jsonb_build_object('ok', false, 'error', 'order_closed');
  end if;
  if v_order.paid_amount > 0 or v_order.payment_status <> 'unpaid'
     or exists (select 1 from public.order_payments p where p.order_id = v_order.id) then
    return jsonb_build_object('ok', false, 'error', 'already_paid');
  end if;

  select coalesce(sum(line_total), 0) into v_old_sum from public.order_items where order_id = v_order.id;
  if v_old_sum <> p_expected_subtotal then
    return jsonb_build_object('ok', false, 'error', 'changed');
  end if;

  select coalesce(sum((i->>'line_total')::numeric), 0) into v_new_sum from jsonb_array_elements(p_items) as i;
  if (p_bill->>'subtotal')::numeric <> v_old_sum + v_new_sum
     or (p_bill->>'subtotal')::numeric - (p_bill->>'discount_amount')::numeric
        + (p_bill->>'service_charge_amount')::numeric + (p_bill->>'tax_amount')::numeric
        + (p_bill->>'rounding_amount')::numeric <> (p_bill->>'total')::numeric then
    return jsonb_build_object('ok', false, 'error', 'bad_bill');
  end if;

  with ins as (
    insert into public.order_items (
      order_id, menu_item_id, item_name, size_name, options, quantity,
      unit_price, line_total, notes, unit_cost, line_cost
    )
    select
      v_order.id, i.menu_item_id, i.item_name, i.size_name, coalesce(i.options, '[]'::jsonb),
      i.quantity, i.unit_price, i.line_total, i.notes, c.unit_cost, c.unit_cost * i.quantity
    from jsonb_array_elements(p_items) with ordinality as e(elem, ord)
    cross join lateral jsonb_to_record(e.elem) as i(
      menu_item_id uuid, item_name text, size_name text, options jsonb,
      quantity int, unit_price numeric, line_total numeric, notes text
    )
    cross join lateral (
      select public.order_line_unit_cost(v_order.restaurant_id, i.menu_item_id, i.size_name, i.options) as unit_cost
    ) as c
    order by e.ord
    returning id
  )
  select array_agg(id) into v_ids from ins;

  -- Food that was already ready goes back to the kitchen; any other status stays as it is.
  v_status := case when v_order.status = 'ready' then 'preparing' else v_order.status end;

  update public.orders o
     set subtotal              = (p_bill->>'subtotal')::numeric,
         discount_amount       = (p_bill->>'discount_amount')::numeric,
         service_charge_amount = (p_bill->>'service_charge_amount')::numeric,
         tax_amount            = (p_bill->>'tax_amount')::numeric,
         rounding_amount       = (p_bill->>'rounding_amount')::numeric,
         total                 = (p_bill->>'total')::numeric,
         cost_total            = s.total,
         cost_complete         = s.complete,
         status                = v_status,
         items_added_at        = now(),
         -- A total of 0 (100% discount) is born paid, as in create_order_tx.
         payment_status        = case when (p_bill->>'total')::numeric = 0 then 'paid' else o.payment_status end
    from (
      select coalesce(sum(oi.line_cost), 0) as total, coalesce(bool_and(oi.unit_cost is not null), true) as complete
        from public.order_items oi where oi.order_id = v_order.id
    ) as s
   where o.id = v_order.id;

  -- No cost in the event: order_events may be shown to staff later.
  insert into public.order_events (restaurant_id, order_id, staff_id, event, detail)
  values (
    p_restaurant_id, v_order.id, p_staff_id, 'items_added',
    jsonb_build_object(
      'item_ids', to_jsonb(v_ids),
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
                  'name', i->>'item_name', 'size', i->>'size_name',
                  'quantity', (i->>'quantity')::int, 'line_total', (i->>'line_total')::numeric)), '[]'::jsonb)
                from jsonb_array_elements(p_items) as i),
      'added_subtotal', v_new_sum,
      'old_total', v_order.total,
      'new_total', (p_bill->>'total')::numeric,
      'status_before', v_order.status,
      'status_after', v_status
    )
  )
  returning id into v_event;

  return jsonb_build_object(
    'ok', true, 'event_id', v_event, 'order_id', v_order.id, 'order_number', v_order.order_number,
    'item_ids', to_jsonb(v_ids), 'added_subtotal', v_new_sum,
    'old_total', v_order.total, 'total', (p_bill->>'total')::numeric,
    'status', v_status, 'status_before', v_order.status
  );
end;
$$;

revoke execute on function public.add_items_to_order_tx(uuid, uuid, uuid, jsonb, numeric, jsonb) from public, anon, authenticated;
grant  execute on function public.add_items_to_order_tx(uuid, uuid, uuid, jsonb, numeric, jsonb) to service_role;
