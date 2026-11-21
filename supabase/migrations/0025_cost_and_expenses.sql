-- 0025_cost_and_expenses.sql
-- B2: item cost, cost snapshot on every order, expenses. Cost and profit are for the OWNER only.
-- Paste into the Supabase SQL Editor and run once. Safe to run again. Needs 0001 to 0024.
--
--  1. menu_costs: the cost price of a menu item, a size or an extra. A SEPARATE table
--     (not a column on menu_items / item_sizes / item_options) because those three
--     tables have "anon can read" policies (the public menu): a column there would be
--     readable by anyone with the website's public key. menu_costs has RLS ON and NO
--     policies, so only the server (service key) can read it. No row = cost not set.
--  2. order_items.unit_cost / line_cost, orders.cost_total / cost_complete: the cost
--     snapshot taken when the order is sold. Old orders keep null / false (no backfill).
--  3. expense_categories and expenses (RLS ON, no policies). An expense is never
--     deleted: it is voided (voided_at, void_reason, voided_by).
--  4. order_line_unit_cost(): the cost of one unit of one order line, from menu_costs.
--  5. create_order_tx: same as 0021, plus the cost snapshot. The cost is ALWAYS worked
--     out here from menu_costs; any cost the caller sends in p_items is ignored.
--  6. save_menu_item_tx: same as 0024, plus costs. Sizes and extras are deleted and
--     re-inserted on every save, so their costs are carried over by name. Only an
--     OWNER may change costs (p_set_costs); a manager's save keeps the costs as they were.
--  7. ensure_default_expense_categories(): the default categories, once per restaurant.
-- New functions: service_role only (anon and authenticated lose EXECUTE, as in 0020).

-- ---------- 1. menu_costs ----------
create table if not exists public.menu_costs (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id   uuid references public.menu_items(id) on delete cascade,
  item_size_id   uuid references public.item_sizes(id) on delete cascade,
  item_option_id uuid references public.item_options(id) on delete cascade,
  cost_price     numeric(10,2) not null check (cost_price >= 0),
  updated_by     uuid references public.staff_accounts(id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint menu_costs_one_target check (num_nonnulls(menu_item_id, item_size_id, item_option_id) = 1)
);
create unique index if not exists menu_costs_item_uidx   on public.menu_costs (menu_item_id)   where menu_item_id is not null;
create unique index if not exists menu_costs_size_uidx   on public.menu_costs (item_size_id)   where item_size_id is not null;
create unique index if not exists menu_costs_option_uidx on public.menu_costs (item_option_id) where item_option_id is not null;
create index if not exists menu_costs_restaurant_idx on public.menu_costs (restaurant_id);

alter table public.menu_costs enable row level security;
-- Deliberately no policies.

-- ---------- 2. cost snapshot columns ----------
alter table public.order_items add column if not exists unit_cost numeric(10,2);
alter table public.order_items add column if not exists line_cost numeric(10,2);
alter table public.orders      add column if not exists cost_total numeric(10,2);
alter table public.orders      add column if not exists cost_complete boolean not null default false;

-- ---------- 3. expenses ----------
create table if not exists public.expense_categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 60),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint expense_categories_id_restaurant_key unique (id, restaurant_id)
);
create unique index if not exists expense_categories_name_uidx
  on public.expense_categories (restaurant_id, lower(trim(name)));

alter table public.expense_categories enable row level security;
-- Deliberately no policies.

create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  expense_date  date not null,
  category_id   uuid not null,
  description   text not null default '' check (length(description) <= 200),
  amount        numeric(10,2) not null check (amount > 0),
  paid_from     text not null check (paid_from in ('drawer_cash', 'bank', 'other')),
  created_by    uuid references public.staff_accounts(id) on delete set null,
  created_at    timestamptz not null default now(),
  voided_at     timestamptz,
  void_reason   text check (void_reason is null or length(trim(void_reason)) between 1 and 200),
  voided_by     uuid references public.staff_accounts(id) on delete set null,
  -- The category must belong to the same restaurant.
  constraint expenses_category_fkey foreign key (category_id, restaurant_id)
    references public.expense_categories (id, restaurant_id),
  constraint expenses_void_pair_check check ((voided_at is null) = (void_reason is null))
);
create index if not exists expenses_restaurant_date_idx on public.expenses (restaurant_id, expense_date desc);

alter table public.expenses enable row level security;
-- Deliberately no policies.

-- ---------- 4. order_line_unit_cost ----------
-- Unit cost = (cost of the chosen size, or of the item when it has no size)
--           + cost of every chosen extra.
-- Any part unknown (no menu_costs row, or not this restaurant's) -> null = "cost not set".
create or replace function public.order_line_unit_cost(
  p_restaurant_id uuid,
  p_menu_item_id  uuid,
  p_size_name     text,
  p_options       jsonb
)
returns numeric
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_base  numeric;
  v_n     int;
  v_known int;
  v_extra numeric;
begin
  if p_menu_item_id is null or not exists (
    select 1 from public.menu_items m where m.id = p_menu_item_id and m.restaurant_id = p_restaurant_id
  ) then
    return null;
  end if;

  if p_size_name is not null then
    select c.cost_price into v_base
    from public.item_sizes s
    join public.menu_costs c on c.item_size_id = s.id and c.restaurant_id = p_restaurant_id
    where s.menu_item_id = p_menu_item_id and s.name = p_size_name
    order by s.sort_order
    limit 1;
  else
    select c.cost_price into v_base
    from public.menu_costs c
    where c.menu_item_id = p_menu_item_id and c.restaurant_id = p_restaurant_id;
  end if;
  if v_base is null then
    return null;
  end if;

  select count(*), count(c.cost_price), coalesce(sum(c.cost_price), 0)
    into v_n, v_known, v_extra
  from jsonb_array_elements(
         case when jsonb_typeof(p_options) = 'array' then p_options else '[]'::jsonb end
       ) as e
  left join public.item_options o on o.id::text = e->>'id' and o.restaurant_id = p_restaurant_id
  left join public.menu_costs c on c.item_option_id = o.id and c.restaurant_id = p_restaurant_id;
  if v_n <> v_known then
    return null;
  end if;

  return v_base + v_extra;
end;
$$;

revoke execute on function public.order_line_unit_cost(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.order_line_unit_cost(uuid, uuid, text, jsonb) to service_role;

-- ---------- 5. create_order_tx (0021 + cost snapshot) ----------
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

  -- Cost snapshot: worked out HERE from menu_costs (never from p_items), so a later
  -- change to the menu cost never changes the profit of an order already sold.
  insert into public.order_items (
    order_id, menu_item_id, item_name, size_name, options, quantity,
    unit_price, line_total, notes, unit_cost, line_cost
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
    i.notes,
    c.unit_cost,
    c.unit_cost * i.quantity
  from jsonb_to_recordset(p_items) as i(
    menu_item_id uuid,
    item_name    text,
    size_name    text,
    options      jsonb,
    quantity     int,
    unit_price   numeric,
    line_total   numeric,
    notes        text
  )
  cross join lateral (
    select public.order_line_unit_cost(v_order.restaurant_id, i.menu_item_id, i.size_name, i.options) as unit_cost
  ) as c;

  -- cost_total = sum of the KNOWN line costs; cost_complete = every line's cost is known.
  update public.orders o
     set cost_total    = s.total,
         cost_complete = s.complete
    from (
      select coalesce(sum(oi.line_cost), 0) as total, bool_and(oi.unit_cost is not null) as complete
      from public.order_items oi
      where oi.order_id = v_order.id
    ) as s
   where o.id = v_order.id
  returning o.* into v_order;

  return v_order;
end;
$$;

revoke execute on function public.create_order_tx(jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.create_order_tx(jsonb, jsonb) to service_role;

-- ---------- 6. save_menu_item_tx (0024 + costs) ----------
-- The old 7-argument version is replaced by this one (the new argument has a default,
-- so a call with the old 7 named arguments still works).
drop function if exists public.save_menu_item_tx(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb);

create or replace function public.save_menu_item_tx(
  p_restaurant_id uuid,
  p_staff_id      uuid,
  p_item_id       uuid,   -- null = create
  p_item          jsonb,  -- category_id, name, description, base_price, ..., cost_price (owner only)
  p_sizes         jsonb,  -- [{name, price, is_default, cost_price?}]
  p_options       jsonb,  -- [{group_name, name, price_delta, max_select, cost_price?}]
  p_changes       jsonb,  -- [{field, old, new}] for the item (entity_id is filled in here)
  p_set_costs     boolean default false  -- true = take the costs from the payload (owner); false = keep them
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id          uuid;
  v_cat         uuid := nullif(p_item->>'category_id', '')::uuid;
  v_name        text := trim(p_item->>'name');
  v_i           int;
  r             jsonb;
  v_new_id      uuid;
  v_cost        numeric;
  v_size_costs  jsonb := '{}'::jsonb;  -- lower(size name) -> cost, before the sizes are re-inserted
  v_opt_costs   jsonb := '{}'::jsonb;  -- lower(group)|lower(name) -> cost
begin
  if not exists (
    select 1 from public.staff_accounts
    where id = p_staff_id and restaurant_id = p_restaurant_id
      and is_active and role in ('owner', 'manager')
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  -- Costs: owner only.
  if p_set_costs and not exists (
    select 1 from public.staff_accounts
    where id = p_staff_id and restaurant_id = p_restaurant_id and is_active and role = 'owner'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  if not exists (
    select 1 from public.menu_categories
    where id = v_cat and restaurant_id = p_restaurant_id and archived_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'category_not_found');
  end if;

  if exists (
    select 1 from public.menu_items
    where restaurant_id = p_restaurant_id and category_id = v_cat and archived_at is null
      and lower(name) = lower(v_name) and id is distinct from p_item_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'duplicate_name');
  end if;

  if p_item_id is null then
    insert into public.menu_items
      (restaurant_id, category_id, name, description, base_price, is_available,
       aliases, is_vegetarian, spice_level, sort_order)
    values
      (p_restaurant_id, v_cat, v_name, nullif(p_item->>'description', ''),
       (p_item->>'base_price')::numeric, coalesce((p_item->>'is_available')::boolean, true),
       coalesce(array(select jsonb_array_elements_text(p_item->'aliases')), '{}'),
       coalesce((p_item->>'is_vegetarian')::boolean, false),
       nullif(p_item->>'spice_level', '')::int, coalesce((p_item->>'sort_order')::int, 0))
    returning id into v_id;
  else
    update public.menu_items set
      category_id   = v_cat,
      name          = v_name,
      description   = nullif(p_item->>'description', ''),
      base_price    = (p_item->>'base_price')::numeric,
      is_available  = coalesce((p_item->>'is_available')::boolean, true),
      aliases       = coalesce(array(select jsonb_array_elements_text(p_item->'aliases')), '{}'),
      is_vegetarian = coalesce((p_item->>'is_vegetarian')::boolean, false),
      spice_level   = nullif(p_item->>'spice_level', '')::int,
      sort_order    = coalesce((p_item->>'sort_order')::int, 0)
    where id = p_item_id and restaurant_id = p_restaurant_id and archived_at is null
    returning id into v_id;
    if v_id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;

  -- Item cost (owner save only; otherwise the row is left as it is).
  if p_set_costs then
    v_cost := nullif(p_item->>'cost_price', '')::numeric;
    if v_cost is null then
      delete from public.menu_costs where menu_item_id = v_id;
    else
      insert into public.menu_costs (restaurant_id, menu_item_id, cost_price, updated_by, updated_at)
      values (p_restaurant_id, v_id, v_cost, p_staff_id, now())
      on conflict (menu_item_id) where menu_item_id is not null
      do update set cost_price = excluded.cost_price, updated_by = excluded.updated_by, updated_at = now();
    end if;
  end if;

  -- Remember the current size/extra costs by name before the rows are replaced.
  select coalesce(jsonb_object_agg(lower(trim(s.name)), c.cost_price), '{}'::jsonb)
    into v_size_costs
  from public.item_sizes s
  join public.menu_costs c on c.item_size_id = s.id
  where s.menu_item_id = v_id;

  select coalesce(jsonb_object_agg(lower(trim(o.group_name)) || '|' || lower(trim(o.name)), c.cost_price), '{}'::jsonb)
    into v_opt_costs
  from public.item_options o
  join public.menu_costs c on c.item_option_id = o.id
  where o.restaurant_id = p_restaurant_id and o.menu_item_id = v_id;

  delete from public.item_sizes where menu_item_id = v_id;
  v_i := 0;
  for r in select * from jsonb_array_elements(coalesce(p_sizes, '[]'::jsonb)) loop
    insert into public.item_sizes (menu_item_id, name, price, is_default, sort_order)
    values (v_id, trim(r->>'name'), (r->>'price')::numeric, coalesce((r->>'is_default')::boolean, false), v_i)
    returning id into v_new_id;
    v_i := v_i + 1;
    v_cost := case when p_set_costs then nullif(r->>'cost_price', '')::numeric
                   else (v_size_costs->>lower(trim(r->>'name')))::numeric end;
    if v_cost is not null then
      insert into public.menu_costs (restaurant_id, item_size_id, cost_price, updated_by, updated_at)
      values (p_restaurant_id, v_new_id, v_cost, p_staff_id, now());
    end if;
  end loop;

  delete from public.item_options where restaurant_id = p_restaurant_id and menu_item_id = v_id;
  for r in select * from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    insert into public.item_options (restaurant_id, menu_item_id, group_name, name, price_delta, max_select)
    values (p_restaurant_id, v_id, trim(r->>'group_name'), trim(r->>'name'),
            (r->>'price_delta')::numeric, coalesce((r->>'max_select')::int, 1))
    returning id into v_new_id;
    v_cost := case when p_set_costs then nullif(r->>'cost_price', '')::numeric
                   else (v_opt_costs->>(lower(trim(r->>'group_name')) || '|' || lower(trim(r->>'name'))))::numeric end;
    if v_cost is not null then
      insert into public.menu_costs (restaurant_id, item_option_id, cost_price, updated_by, updated_at)
      values (p_restaurant_id, v_new_id, v_cost, p_staff_id, now());
    end if;
  end loop;

  insert into public.menu_changes (restaurant_id, staff_id, entity, entity_id, field, old_value, new_value)
  select p_restaurant_id, p_staff_id, 'item', v_id, c->>'field', c->>'old', c->>'new'
  from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) as c;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke execute on function public.save_menu_item_tx(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant  execute on function public.save_menu_item_tx(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, boolean) to service_role;

-- ---------- 7. default expense categories ----------
create or replace function public.ensure_default_expense_categories(p_restaurant_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.expense_categories where restaurant_id = p_restaurant_id) then
    return;
  end if;
  insert into public.expense_categories (restaurant_id, name)
  select p_restaurant_id, n
  from unnest(array['Rent', 'Salaries', 'Electricity', 'Gas', 'Ingredients', 'Packaging',
                    'Fuel/Delivery', 'Maintenance', 'Marketing', 'Other']) as n
  on conflict do nothing;
end;
$$;

revoke execute on function public.ensure_default_expense_categories(uuid) from public, anon, authenticated;
grant  execute on function public.ensure_default_expense_categories(uuid) to service_role;
