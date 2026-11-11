-- 0002_search_menu.sql — fuzzy menu search for the voice agent.
-- Paste into the Supabase SQL Editor and run once. Requires 0001_init.sql.
--
-- Speech-to-text mishears food names ("margarita", "pepper only"), so we score
-- each item by pg_trgm similarity against its name AND every alias, keep the
-- best score per item, and return the top 3 items scoring >= 0.3.
-- pg_trgm lives in the "extensions" schema in this project, hence extensions.similarity.

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
