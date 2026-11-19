-- 0019_settings_update_tx.sql
-- P8b: saving Settings and writing its audit row happen in ONE transaction.
-- Paste into the Supabase SQL Editor and run once. Safe to run again.
--
-- update_restaurant_settings_tx(restaurant, staff, section, values):
--   * checks the staff account is an ACTIVE OWNER of that restaurant (so even a
--     direct call can't change someone else's restaurant);
--   * only allows the fields of that section. currency and timezone are NOT
--     allowed here at all (they are read-only on the Settings page);
--   * locks the restaurant row, works out what really changed, updates it and
--     inserts the settings_audit row. If either step fails, BOTH are undone:
--     no setting is saved without its audit row, and no audit row without its
--     setting. A save that changes nothing writes nothing.
--   Returns { ok: true, changed: [...] } or { ok: false, error: '...' }.
--
-- Also (idempotent, in case 0018 was not run): the settings_audit table with
-- RLS ON and NO policies, and the two non-negative checks on restaurants.
-- security invoker like the other *_tx functions: the app calls it with the
-- server (service) key; anon/authenticated lose EXECUTE. No GRANT statements.

create table if not exists public.settings_audit (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  staff_id       uuid references public.staff_accounts(id) on delete set null,
  username       text not null,
  section        text not null,
  changes        jsonb not null,
  created_at     timestamptz not null default now()
);

create index if not exists settings_audit_restaurant_created_idx
  on public.settings_audit (restaurant_id, created_at desc);

alter table public.settings_audit enable row level security;
-- Deliberately no policies.

alter table public.restaurants drop constraint if exists restaurants_delivery_fee_nonneg;
alter table public.restaurants
  add constraint restaurants_delivery_fee_nonneg check (delivery_fee is null or delivery_fee >= 0);

alter table public.restaurants drop constraint if exists restaurants_min_order_nonneg;
alter table public.restaurants
  add constraint restaurants_min_order_nonneg check (min_order_value is null or min_order_value >= 0);

create or replace function public.update_restaurant_settings_tx(
  p_restaurant_id uuid,
  p_staff_id      uuid,
  p_section       text,
  p_values        jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_username text;
  v_role     text;
  v_active   boolean;
  v_allowed  text[];
  v_key      text;
  v_current  jsonb;
  v_changes  jsonb := '{}'::jsonb;
begin
  -- 1. Who is saving: an active owner of THIS restaurant.
  select username, role, is_active into v_username, v_role, v_active
    from public.staff_accounts
   where id = p_staff_id and restaurant_id = p_restaurant_id;
  if not found or not v_active or v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  -- 2. Which fields this section may change (currency and timezone are in none of them).
  v_allowed := case p_section
    when 'profile' then array['name', 'tagline', 'parent_group_name', 'phone', 'whatsapp_number', 'address_line',
                              'city', 'postcode', 'website_url', 'instagram_handle', 'facebook_url', 'receipt_footer_note']
    when 'money'   then array['delivery_fee', 'min_order_value', 'tax_rate_percent', 'service_charge_percent',
                              'service_charge_applies_to', 'max_discount_percent']
    when 'orders'  then array['is_accepting_orders']
    when 'theme'   then array['theme_primary', 'theme_accent', 'theme_secondary', 'theme_background', 'theme_text']
    else null
  end;
  if v_allowed is null then
    return jsonb_build_object('ok', false, 'error', 'bad_section');
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_values');
  end if;
  for v_key in select jsonb_object_keys(p_values) loop
    if not (v_key = any (v_allowed)) then
      return jsonb_build_object('ok', false, 'error', 'bad_field', 'field', v_key);
    end if;
  end loop;

  -- 3. Lock the restaurant row (two owners saving together take turns) and see what really changes.
  select to_jsonb(r) into v_current from public.restaurants r where r.id = p_restaurant_id for update;
  if v_current is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  for v_key in select jsonb_object_keys(p_values) loop
    if (v_current -> v_key) is distinct from (p_values -> v_key) then
      v_changes := v_changes || jsonb_build_object(
        v_key, jsonb_build_object('from', v_current -> v_key, 'to', p_values -> v_key));
    end if;
  end loop;
  if v_changes = '{}'::jsonb then
    return jsonb_build_object('ok', true, 'changed', '[]'::jsonb);
  end if;

  -- 4. Save the changed fields (a field that did not change keeps its value).
  update public.restaurants set
    name                      = case when v_changes ? 'name' then p_values ->> 'name' else name end,
    tagline                   = case when v_changes ? 'tagline' then p_values ->> 'tagline' else tagline end,
    parent_group_name         = case when v_changes ? 'parent_group_name' then p_values ->> 'parent_group_name' else parent_group_name end,
    phone                     = case when v_changes ? 'phone' then p_values ->> 'phone' else phone end,
    whatsapp_number           = case when v_changes ? 'whatsapp_number' then p_values ->> 'whatsapp_number' else whatsapp_number end,
    address_line              = case when v_changes ? 'address_line' then p_values ->> 'address_line' else address_line end,
    city                      = case when v_changes ? 'city' then p_values ->> 'city' else city end,
    postcode                  = case when v_changes ? 'postcode' then p_values ->> 'postcode' else postcode end,
    website_url               = case when v_changes ? 'website_url' then p_values ->> 'website_url' else website_url end,
    instagram_handle          = case when v_changes ? 'instagram_handle' then p_values ->> 'instagram_handle' else instagram_handle end,
    facebook_url              = case when v_changes ? 'facebook_url' then p_values ->> 'facebook_url' else facebook_url end,
    receipt_footer_note       = case when v_changes ? 'receipt_footer_note' then p_values ->> 'receipt_footer_note' else receipt_footer_note end,
    delivery_fee              = case when v_changes ? 'delivery_fee' then (p_values ->> 'delivery_fee')::numeric else delivery_fee end,
    min_order_value           = case when v_changes ? 'min_order_value' then (p_values ->> 'min_order_value')::numeric else min_order_value end,
    tax_rate_percent          = case when v_changes ? 'tax_rate_percent' then (p_values ->> 'tax_rate_percent')::numeric else tax_rate_percent end,
    service_charge_percent    = case when v_changes ? 'service_charge_percent' then (p_values ->> 'service_charge_percent')::numeric else service_charge_percent end,
    service_charge_applies_to = case when v_changes ? 'service_charge_applies_to' then p_values ->> 'service_charge_applies_to' else service_charge_applies_to end,
    max_discount_percent      = case when v_changes ? 'max_discount_percent' then (p_values ->> 'max_discount_percent')::numeric else max_discount_percent end,
    is_accepting_orders       = case when v_changes ? 'is_accepting_orders' then (p_values ->> 'is_accepting_orders')::boolean else is_accepting_orders end,
    theme_primary             = case when v_changes ? 'theme_primary' then p_values ->> 'theme_primary' else theme_primary end,
    theme_accent              = case when v_changes ? 'theme_accent' then p_values ->> 'theme_accent' else theme_accent end,
    theme_secondary           = case when v_changes ? 'theme_secondary' then p_values ->> 'theme_secondary' else theme_secondary end,
    theme_background          = case when v_changes ? 'theme_background' then p_values ->> 'theme_background' else theme_background end,
    theme_text                = case when v_changes ? 'theme_text' then p_values ->> 'theme_text' else theme_text end
  where id = p_restaurant_id;

  -- 5. The audit row, in the same transaction: if this insert fails, the update above is undone too.
  insert into public.settings_audit (restaurant_id, staff_id, username, section, changes)
  values (p_restaurant_id, p_staff_id, v_username, p_section, v_changes);

  return jsonb_build_object(
    'ok', true,
    'changed', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(v_changes) as k));
end;
$$;

-- Only the server (service key) calls this. Not for the browser's anon / logged-in roles.
revoke execute on function public.update_restaurant_settings_tx(uuid, uuid, text, jsonb) from anon, authenticated;
