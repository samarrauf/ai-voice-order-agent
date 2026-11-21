-- 0024_menu_editor.sql
-- P7: Menu editor. Paste into the Supabase SQL Editor and run once. Safe to run again.
--
--  1. menu_items.image_url, menu_items.archived_at, menu_categories.archived_at
--     (soft delete: old orders keep their saved name/price in order_items anyway).
--  2. Storage bucket "menu-photos" (public READ). There is no write policy, so
--     only the server (service key) can upload or delete; the browser cannot.
--  3. menu_changes: who changed which field from what to what. RLS ON, no policies.
--  4. save_menu_item_tx: saves an item + its sizes + its extras + the change log
--     rows in ONE transaction. Checks the staff account is an ACTIVE owner/manager
--     of that restaurant. service_role only (anon/authenticated lose EXECUTE).
--  5. search_menu (voice agent) no longer returns archived items. Same signature,
--     so its existing permissions stay as they are.

alter table public.menu_items      add column if not exists image_url   text;
alter table public.menu_items      add column if not exists archived_at timestamptz;
alter table public.menu_categories add column if not exists archived_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-photos', 'menu-photos', true, 1572864, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table if not exists public.menu_changes (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id      uuid references public.staff_accounts(id) on delete set null,
  entity        text not null,
  entity_id     uuid,
  field         text not null,
  old_value     text,
  new_value     text,
  changed_at    timestamptz not null default now()
);

create index if not exists menu_changes_restaurant_changed_idx
  on public.menu_changes (restaurant_id, changed_at desc);

alter table public.menu_changes enable row level security;
-- Deliberately no policies.

create or replace function public.save_menu_item_tx(
  p_restaurant_id uuid,
  p_staff_id      uuid,
  p_item_id       uuid,   -- null = create
  p_item          jsonb,  -- category_id, name, description, base_price, is_vegetarian, spice_level, sort_order, is_available, aliases[]
  p_sizes         jsonb,  -- [{name, price, is_default}]
  p_options       jsonb,  -- [{group_name, name, price_delta, max_select}]
  p_changes       jsonb   -- [{field, old, new}] for the item (entity_id is filled in here)
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id   uuid;
  v_cat  uuid := nullif(p_item->>'category_id', '')::uuid;
  v_name text := trim(p_item->>'name');
  v_i    int;
  r      jsonb;
begin
  if not exists (
    select 1 from public.staff_accounts
    where id = p_staff_id and restaurant_id = p_restaurant_id
      and is_active and role in ('owner', 'manager')
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

  delete from public.item_sizes where menu_item_id = v_id;
  v_i := 0;
  for r in select * from jsonb_array_elements(coalesce(p_sizes, '[]'::jsonb)) loop
    insert into public.item_sizes (menu_item_id, name, price, is_default, sort_order)
    values (v_id, trim(r->>'name'), (r->>'price')::numeric, coalesce((r->>'is_default')::boolean, false), v_i);
    v_i := v_i + 1;
  end loop;

  delete from public.item_options where restaurant_id = p_restaurant_id and menu_item_id = v_id;
  for r in select * from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    insert into public.item_options (restaurant_id, menu_item_id, group_name, name, price_delta, max_select)
    values (p_restaurant_id, v_id, trim(r->>'group_name'), trim(r->>'name'),
            (r->>'price_delta')::numeric, coalesce((r->>'max_select')::int, 1));
  end loop;

  insert into public.menu_changes (restaurant_id, staff_id, entity, entity_id, field, old_value, new_value)
  select p_restaurant_id, p_staff_id, 'item', v_id, c->>'field', c->>'old', c->>'new'
  from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) as c;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke execute on function public.save_menu_item_tx(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.save_menu_item_tx(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb) to service_role;

-- Voice agent: archived items (and items of archived categories) are not found.
create or replace function public.search_menu(p_restaurant_id uuid, p_query text)
returns table (
  id           uuid,
  name         text,
  description  text,
  is_available boolean,
  base_price   numeric,
  score        real,
  sizes        jsonb
)
language sql
stable
set search_path = ''
as $$
  with q as (
    select lower(trim(p_query)) as text
  ),
  scored as (
    select
      mi.id,
      mi.name,
      mi.description,
      mi.is_available,
      mi.base_price,
      mi.sort_order,
      greatest(
        extensions.similarity(lower(mi.name), q.text),
        coalesce(
          (select max(extensions.similarity(lower(a), q.text)) from unnest(mi.aliases) as a),
          0
        )
      ) as score
    from public.menu_items mi
    cross join q
    where mi.restaurant_id = p_restaurant_id
      and mi.archived_at is null
      and not exists (
        select 1 from public.menu_categories mc
        where mc.id = mi.category_id and mc.archived_at is not null
      )
      and q.text <> ''
  ),
  top_matches as (
    select *
    from scored
    where score >= 0.3
    order by score desc, sort_order
    limit 3
  )
  select
    t.id,
    t.name,
    t.description,
    t.is_available,
    t.base_price,
    t.score,
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object('name', s.name, 'price', s.price)
                 order by s.sort_order
               )
        from public.item_sizes s
        where s.menu_item_id = t.id
      ),
      '[]'::jsonb
    ) as sizes
  from top_matches t
  order by t.score desc, t.sort_order;
$$;
