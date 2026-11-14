-- 0008_pos_foundations.sql — groundwork for the POS (Phase 3a).
-- Paste into the Supabase SQL Editor and run once. Requires 0001, 0005 and 0006.
--
-- 1. table_sessions: "who is sitting at which table right now" — either a
--    walk-in or someone who booked. cleared_at stays null while the table is
--    occupied and is filled in when the table is free again.
-- 2. orders.source: where the order came from (phone call, a seated booking,
--    or a walk-in). Every existing order becomes 'phone' via the default.
-- 3. orders.table_session_id: links a dine-in order to the table it was for.
-- 4. create_order_tx now saves `source` (and defaults to 'phone' if absent).
--
-- RLS is on and there are NO policies: only the service role (server code)
-- can touch the new table. No GRANT statements — see CLAUDE.md rule 8.

create table public.table_sessions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id      uuid not null references public.restaurant_tables(id) on delete cascade,
  booking_id    uuid references public.bookings(id) on delete set null,
  party_size    int  not null check (party_size > 0),
  source        text not null check (source in ('walk_in', 'booking')),
  seated_at     timestamptz not null default now(),
  cleared_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index table_sessions_table_idx on public.table_sessions (table_id, seated_at desc);

alter table public.table_sessions enable row level security;

alter table public.orders
  add column source text not null default 'phone'
    check (source in ('phone', 'table_booking', 'walk_in')),
  add column table_session_id uuid references public.table_sessions(id) on delete set null;

-- Same function as 0005, plus the `source` column.
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
    payment_method, requested_time, notes, source
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
    coalesce(p_order->>'source', 'phone')
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
