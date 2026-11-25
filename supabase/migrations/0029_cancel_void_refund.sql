-- 0029_cancel_void_refund.sql — B4b: cancel an order, void an item, refund a payment.
-- Paste into the Supabase SQL Editor and run once. Needs 0013, 0014, 0025, 0027, 0028.
--
-- 1. orders: cancel_reason, cancelled_by, cancelled_at, refunded_amount.
--    paid_amount now means NET paid (payments minus refunds); refunded_amount is the
--    sum of the refunds. payment_status gains 'refunded' and 'partially_refunded'.
--    New check: refunded_amount >= 0 and paid_amount + refunded_amount <= total
--    (the money ever taken never goes above the bill). The 0014 check (net paid 0..total) stays.
-- 2. order_items: voided_at, void_reason, voided_by. A voided line stays for the record
--    (the kitchen ticket prints it as VOID) but is no longer part of the bill or the cost.
-- 3. order_payments: kind ('payment' | 'refund'), refund_reason (required for a refund),
--    staff_id. A cash refund is kind 'refund' + method 'cash' (the later cash drawer
--    stage subtracts those).
-- 4. record_payment_tx: as 0027, plus: no new payment once an order was refunded, and a
--    key already used by a refund is refused ('key_used').
-- 5. record_refund_tx: refunds part or all of the NET paid amount, atomically.
-- 6. cancel_order_tx: cancels an order; if money was taken it refunds ALL of it in the
--    same transaction ("Cancel and refund").
-- 7. void_order_item_tx: voids one line of an unpaid order and saves the new bill.
-- 8. add_items_to_order_tx and merge_orders_tx: same as 0028/0027 but voided lines are
--    left out of the subtotal and the cost.
--
-- No new tables, no new policies. New/changed functions: service_role only.
-- No GRANT statements on tables — see CLAUDE.md rule 2.

-- ---------- 1. orders ----------
alter table public.orders
  add column if not exists cancel_reason   text,
  add column if not exists cancelled_by    uuid references public.staff_accounts(id) on delete set null,
  add column if not exists cancelled_at    timestamptz,
  add column if not exists refunded_amount numeric(10,2) not null default 0;

-- payment_status: drop the old check (found by its definition, not its name) and add the new one.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.orders'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%payment_status%'
       and pg_get_constraintdef(oid) like '%unpaid%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'partial', 'paid', 'refunded', 'partially_refunded'));

-- Money ever taken (net + refunded) stays within the bill. Every existing row has
-- refunded_amount = 0, so this holds wherever the 0014 check holds.
do $$
declare v_bad int;
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'public.orders'::regclass and conname = 'orders_refund_within_total') then
    raise notice 'orders_refund_within_total already exists, skipped';
    return;
  end if;
  select count(*) into v_bad from public.orders
   where refunded_amount < 0 or paid_amount + refunded_amount > total;
  if v_bad = 0 then
    alter table public.orders add constraint orders_refund_within_total
      check (refunded_amount >= 0 and paid_amount + refunded_amount <= total);
  else
    alter table public.orders add constraint orders_refund_within_total
      check (refunded_amount >= 0 and paid_amount + refunded_amount <= total) not valid;
    raise notice 'orders_refund_within_total added NOT VALID: % existing rows break it', v_bad;
  end if;
end $$;

-- ---------- 2. order_items ----------
alter table public.order_items
  add column if not exists voided_at   timestamptz,
  add column if not exists void_reason text,
  add column if not exists voided_by   uuid references public.staff_accounts(id) on delete set null;

-- ---------- 3. order_payments ----------
alter table public.order_payments
  add column if not exists kind          text not null default 'payment',
  add column if not exists refund_reason text,
  add column if not exists staff_id      uuid references public.staff_accounts(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.order_payments'::regclass and conname = 'order_payments_kind_check') then
    alter table public.order_payments add constraint order_payments_kind_check
      check (kind in ('payment', 'refund'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.order_payments'::regclass and conname = 'order_payments_refund_reason_check') then
    alter table public.order_payments add constraint order_payments_refund_reason_check
      check (kind = 'payment' or char_length(btrim(coalesce(refund_reason, ''))) > 0);
  end if;
end $$;

-- ---------- 4. record_payment_tx ----------
-- Same as 0027, plus 'order_refunded' and 'key_used'.
create or replace function public.record_payment_tx(
  p_restaurant_id   uuid,
  p_order_id        uuid,
  p_method          text,
  p_amount          numeric,
  p_reference       text,
  p_created_by      text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order  public.orders;
  v_kind   text;
  v_paid   numeric(10,2);
  v_status text;
begin
  select * into v_order
    from public.orders
   where id = p_order_id and restaurant_id = p_restaurant_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  if p_idempotency_key is not null then
    select kind into v_kind from public.order_payments
     where order_id = p_order_id and idempotency_key = p_idempotency_key;
    if found then
      if v_kind <> 'payment' then
        return jsonb_build_object('ok', false, 'error', 'key_used');
      end if;
      return jsonb_build_object(
        'ok', true, 'duplicate', true,
        'payment_status', v_order.payment_status, 'paid_amount', v_order.paid_amount,
        'total', v_order.total, 'balance', v_order.total - v_order.paid_amount
      );
    end if;
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'order_cancelled');
  end if;
  if v_order.status = 'merged' then
    return jsonb_build_object('ok', false, 'error', 'order_merged');
  end if;
  -- After a refund the bill is settled: no new payment on it.
  if v_order.refunded_amount > 0 then
    return jsonb_build_object('ok', false, 'error', 'order_refunded');
  end if;
  if v_order.paid_amount >= v_order.total then
    return jsonb_build_object('ok', false, 'error', 'already_paid');
  end if;
  if v_order.paid_amount + p_amount > v_order.total then
    return jsonb_build_object('ok', false, 'error', 'overpayment');
  end if;

  insert into public.order_payments
    (restaurant_id, order_id, kind, method, amount, reference, created_by, idempotency_key)
  values
    (p_restaurant_id, p_order_id, 'payment', p_method, p_amount, p_reference, p_created_by, p_idempotency_key);

  v_paid := v_order.paid_amount + p_amount;
  v_status := case when v_paid >= v_order.total then 'paid' else 'partial' end;

  update public.orders
     set paid_amount = v_paid, payment_status = v_status
   where id = p_order_id;

  return jsonb_build_object(
    'ok', true, 'duplicate', false,
    'payment_status', v_status, 'paid_amount', v_paid,
    'total', v_order.total, 'balance', v_order.total - v_paid
  );
end;
$$;

revoke execute on function public.record_payment_tx(uuid, uuid, text, numeric, text, text, text) from public, anon, authenticated;
grant  execute on function public.record_payment_tx(uuid, uuid, text, numeric, text, text, text) to service_role;

-- ---------- 5. record_refund_tx ----------
-- Returns {"ok": true, "duplicate", "payment_status", "paid_amount", "refunded_amount",
-- "refund_amount", "refund_method"} or {"ok": false, "error": "order_not_found" |
-- "key_used" | "order_merged" | "nothing_to_refund" | "not_fully_paid" | "overrefund"}.
-- A part-paid order (payment_status 'partial') is not refunded: take the rest first, or
-- cancel the order (cancel_order_tx refunds everything that was taken).
create or replace function public.record_refund_tx(
  p_restaurant_id   uuid,
  p_staff_id        uuid,
  p_order_id        uuid,
  p_method          text,
  p_amount          numeric,
  p_reason          text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order  public.orders;
  v_prior  public.order_payments;
  v_net    numeric(10,2);
  v_status text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'record_refund_tx: amount must be more than 0';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception 'record_refund_tx: reason is required';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) = 0 then
    raise exception 'record_refund_tx: idempotency key is required';
  end if;

  -- Lock the order: two refunds at the same moment wait for each other, so the second
  -- one sees the lower net paid amount.
  select * into v_order from public.orders
   where id = p_order_id and restaurant_id = p_restaurant_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  select * into v_prior from public.order_payments
   where order_id = p_order_id and idempotency_key = p_idempotency_key;
  if found then
    if v_prior.kind <> 'refund' then
      return jsonb_build_object('ok', false, 'error', 'key_used');
    end if;
    return jsonb_build_object(
      'ok', true, 'duplicate', true,
      'payment_status', v_order.payment_status, 'paid_amount', v_order.paid_amount,
      'refunded_amount', v_order.refunded_amount,
      'refund_amount', v_prior.amount, 'refund_method', v_prior.method
    );
  end if;

  if v_order.status = 'merged' then
    return jsonb_build_object('ok', false, 'error', 'order_merged');
  end if;
  if v_order.paid_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_refund');
  end if;
  if v_order.payment_status = 'partial' then
    return jsonb_build_object('ok', false, 'error', 'not_fully_paid');
  end if;
  if p_amount > v_order.paid_amount then
    return jsonb_build_object('ok', false, 'error', 'overrefund');
  end if;

  insert into public.order_payments
    (restaurant_id, order_id, kind, method, amount, refund_reason, created_by, staff_id, idempotency_key)
  values
    (p_restaurant_id, p_order_id, 'refund', p_method, p_amount, btrim(p_reason), 'dashboard', p_staff_id, p_idempotency_key);

  v_net := v_order.paid_amount - p_amount;
  v_status := case when v_net = 0 then 'refunded' else 'partially_refunded' end;

  update public.orders
     set paid_amount = v_net,
         refunded_amount = v_order.refunded_amount + p_amount,
         payment_status = v_status
   where id = p_order_id;

  insert into public.order_events (restaurant_id, order_id, staff_id, event, detail)
  values (p_restaurant_id, p_order_id, p_staff_id, 'refunded',
    jsonb_build_object('amount', p_amount, 'method', p_method, 'reason', btrim(p_reason),
                       'paid_before', v_order.paid_amount, 'paid_after', v_net,
                       'payment_status_before', v_order.payment_status, 'payment_status_after', v_status,
                       'with_cancel', false));

  return jsonb_build_object(
    'ok', true, 'duplicate', false,
    'payment_status', v_status, 'paid_amount', v_net,
    'refunded_amount', v_order.refunded_amount + p_amount,
    'refund_amount', p_amount, 'refund_method', p_method
  );
end;
$$;

revoke execute on function public.record_refund_tx(uuid, uuid, uuid, text, numeric, text, text) from public, anon, authenticated;
grant  execute on function public.record_refund_tx(uuid, uuid, uuid, text, numeric, text, text) to service_role;

-- ---------- 6. cancel_order_tx ----------
-- p_can_cancel_any: the caller's role has the cancel_order capability (owner/manager).
-- Without it only a 'new' order with no payment at all can be cancelled.
-- If money was taken (net paid > 0) p_refund_method is required and ALL of it is
-- refunded in the same transaction. The order row is updated BEFORE the refund row is
-- written, so a failing refund (bad method, key clash) rolls the cancel back too.
-- Returns {"ok": true, "duplicate", "status", "payment_status", "refunded"} or
-- {"ok": false, "error": "order_not_found" | "order_closed" | "needs_manager" |
-- "refund_required" | "key_used", "paid_amount"?}.
create or replace function public.cancel_order_tx(
  p_restaurant_id   uuid,
  p_staff_id        uuid,
  p_order_id        uuid,
  p_reason          text,
  p_can_cancel_any  boolean,
  p_refund_method   text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order   public.orders;
  v_paid    boolean;
  v_refund  numeric(10,2) := 0;
begin
  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception 'cancel_order_tx: reason is required';
  end if;

  select * into v_order from public.orders
   where id = p_order_id and restaurant_id = p_restaurant_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  -- A double click: the order is already cancelled, nothing more happens.
  if v_order.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'status', 'cancelled',
                              'payment_status', v_order.payment_status, 'refunded', 0);
  end if;
  if v_order.status in ('completed', 'merged') then
    return jsonb_build_object('ok', false, 'error', 'order_closed');
  end if;

  v_paid := v_order.paid_amount > 0 or v_order.refunded_amount > 0
            or exists (select 1 from public.order_payments p where p.order_id = v_order.id);
  if not coalesce(p_can_cancel_any, false) and (v_order.status <> 'new' or v_paid) then
    return jsonb_build_object('ok', false, 'error', 'needs_manager');
  end if;

  if v_order.paid_amount > 0 then
    if p_refund_method is null then
      return jsonb_build_object('ok', false, 'error', 'refund_required', 'paid_amount', v_order.paid_amount);
    end if;
    if p_idempotency_key is not null and exists (
      select 1 from public.order_payments where order_id = v_order.id and idempotency_key = p_idempotency_key
    ) then
      return jsonb_build_object('ok', false, 'error', 'key_used');
    end if;
  end if;

  update public.orders
     set status = 'cancelled', cancel_reason = btrim(p_reason), cancelled_by = p_staff_id,
         cancelled_at = now(), updated_at = now()
   where id = v_order.id;

  if v_order.paid_amount > 0 then
    v_refund := v_order.paid_amount;
    insert into public.order_payments
      (restaurant_id, order_id, kind, method, amount, refund_reason, created_by, staff_id, idempotency_key)
    values
      (p_restaurant_id, v_order.id, 'refund', p_refund_method, v_refund, btrim(p_reason), 'dashboard', p_staff_id, p_idempotency_key);
    update public.orders
       set paid_amount = 0, refunded_amount = v_order.refunded_amount + v_refund, payment_status = 'refunded'
     where id = v_order.id;
    insert into public.order_events (restaurant_id, order_id, staff_id, event, detail)
    values (p_restaurant_id, v_order.id, p_staff_id, 'refunded',
      jsonb_build_object('amount', v_refund, 'method', p_refund_method, 'reason', btrim(p_reason),
                         'paid_before', v_order.paid_amount, 'paid_after', 0,
                         'payment_status_before', v_order.payment_status, 'payment_status_after', 'refunded',
                         'with_cancel', true));
  end if;

  insert into public.order_events (restaurant_id, order_id, staff_id, event, detail)
  values (p_restaurant_id, v_order.id, p_staff_id, 'cancelled',
    jsonb_build_object('reason', btrim(p_reason), 'status_before', v_order.status,
                       'payment_status_before', v_order.payment_status,
                       'total', v_order.total, 'refunded', v_refund));

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'status', 'cancelled',
    'payment_status', case when v_refund > 0 then 'refunded' else v_order.payment_status end,
    'refunded', v_refund
  );
end;
$$;

revoke execute on function public.cancel_order_tx(uuid, uuid, uuid, text, boolean, text, text) from public, anon, authenticated;
grant  execute on function public.cancel_order_tx(uuid, uuid, uuid, text, boolean, text, text) to service_role;

-- ---------- 7. void_order_item_tx ----------
-- The server worked out the new bill with computeBill from the remaining (not voided)
-- lines, with the discount clamped to the new subtotal / cap (p_discount). This function
-- locks the order, checks nothing changed since the server read it, then voids the line
-- and saves the new money numbers and cost. Only an unpaid, open order; never the last line.
-- p_bill:     subtotal, discount_amount, service_charge_amount, tax_amount, rounding_amount, total.
-- p_discount: {"type": "none" | "percent" | "fixed", "value": number}.
-- Returns {"ok": true, "duplicate", ...} or {"ok": false, "error": "order_not_found" |
-- "item_not_found" | "order_closed" | "already_paid" | "last_item" | "changed" | "bad_bill"}.
create or replace function public.void_order_item_tx(
  p_restaurant_id     uuid,
  p_staff_id          uuid,
  p_order_id          uuid,
  p_item_id           uuid,
  p_reason            text,
  p_expected_subtotal numeric,
  p_bill              jsonb,
  p_discount          jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order  public.orders;
  v_item   public.order_items;
  v_left   int;
  v_old    numeric;
  v_dtype  text := coalesce(p_discount->>'type', 'none');
  v_dvalue numeric := coalesce((p_discount->>'value')::numeric, 0);
begin
  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception 'void_order_item_tx: reason is required';
  end if;
  if v_dtype not in ('none', 'percent', 'fixed') or v_dvalue < 0 then
    raise exception 'void_order_item_tx: bad discount';
  end if;

  select * into v_order from public.orders
   where id = p_order_id and restaurant_id = p_restaurant_id
   for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'order_not_found'); end if;

  select * into v_item from public.order_items where id = p_item_id and order_id = v_order.id;
  if not found then return jsonb_build_object('ok', false, 'error', 'item_not_found'); end if;

  -- A double click: already voided, nothing more happens.
  if v_item.voided_at is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'total', v_order.total);
  end if;

  if v_order.status in ('cancelled', 'completed', 'merged') then
    return jsonb_build_object('ok', false, 'error', 'order_closed');
  end if;
  if v_order.paid_amount > 0 or v_order.refunded_amount > 0
     or exists (select 1 from public.order_payments p where p.order_id = v_order.id) then
    return jsonb_build_object('ok', false, 'error', 'already_paid');
  end if;

  select count(*), coalesce(sum(line_total), 0) into v_left, v_old
    from public.order_items where order_id = v_order.id and voided_at is null;
  if v_left <= 1 then
    return jsonb_build_object('ok', false, 'error', 'last_item');
  end if;
  if v_old <> p_expected_subtotal then
    return jsonb_build_object('ok', false, 'error', 'changed');
  end if;

  if (p_bill->>'subtotal')::numeric <> v_old - v_item.line_total
     or (p_bill->>'subtotal')::numeric - (p_bill->>'discount_amount')::numeric + v_order.delivery_fee
        + (p_bill->>'service_charge_amount')::numeric + (p_bill->>'tax_amount')::numeric
        + (p_bill->>'rounding_amount')::numeric <> (p_bill->>'total')::numeric
     or (p_bill->>'discount_amount')::numeric > (p_bill->>'subtotal')::numeric then
    return jsonb_build_object('ok', false, 'error', 'bad_bill');
  end if;

  update public.order_items
     set voided_at = now(), void_reason = btrim(p_reason), voided_by = p_staff_id
   where id = v_item.id;

  update public.orders o
     set subtotal              = (p_bill->>'subtotal')::numeric,
         discount_type         = v_dtype,
         discount_value        = case when v_dtype = 'none' then 0 else v_dvalue end,
         discount_reason       = case when v_dtype = 'none' then null else o.discount_reason end,
         discount_amount       = (p_bill->>'discount_amount')::numeric,
         service_charge_amount = (p_bill->>'service_charge_amount')::numeric,
         tax_amount            = (p_bill->>'tax_amount')::numeric,
         rounding_amount       = (p_bill->>'rounding_amount')::numeric,
         total                 = (p_bill->>'total')::numeric,
         cost_total            = s.total,
         cost_complete         = s.complete,
         updated_at            = now(),
         payment_status        = case when (p_bill->>'total')::numeric = 0 then 'paid' else o.payment_status end
    from (
      select coalesce(sum(oi.line_cost), 0) as total, coalesce(bool_and(oi.unit_cost is not null), true) as complete
        from public.order_items oi where oi.order_id = v_order.id and oi.voided_at is null
    ) as s
   where o.id = v_order.id;

  -- No cost in the event: order_events may be shown to staff.
  insert into public.order_events (restaurant_id, order_id, staff_id, event, detail)
  values (p_restaurant_id, v_order.id, p_staff_id, 'item_voided',
    jsonb_build_object('item_id', v_item.id, 'name', v_item.item_name, 'size', v_item.size_name,
                       'quantity', v_item.quantity, 'line_total', v_item.line_total,
                       'reason', btrim(p_reason),
                       'old_total', v_order.total, 'new_total', (p_bill->>'total')::numeric,
                       'discount_before', jsonb_build_object('type', v_order.discount_type, 'value', v_order.discount_value,
                                                             'amount', v_order.discount_amount),
                       'discount_after', jsonb_build_object('type', v_dtype, 'value', case when v_dtype = 'none' then 0 else v_dvalue end,
                                                            'amount', (p_bill->>'discount_amount')::numeric)));

  return jsonb_build_object('ok', true, 'duplicate', false, 'order_number', v_order.order_number,
                            'old_total', v_order.total, 'total', (p_bill->>'total')::numeric);
end;
$$;

revoke execute on function public.void_order_item_tx(uuid, uuid, uuid, uuid, text, numeric, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.void_order_item_tx(uuid, uuid, uuid, uuid, text, numeric, jsonb, jsonb) to service_role;

-- ---------- 8a. add_items_to_order_tx: voided lines left out ----------
-- Same as 0028 except: the old subtotal and the cost sum skip voided lines, and a
-- refunded order counts as paid.
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
  if v_order.paid_amount > 0 or v_order.refunded_amount > 0 or v_order.payment_status <> 'unpaid'
     or exists (select 1 from public.order_payments p where p.order_id = v_order.id) then
    return jsonb_build_object('ok', false, 'error', 'already_paid');
  end if;

  select coalesce(sum(line_total), 0) into v_old_sum
    from public.order_items where order_id = v_order.id and voided_at is null;
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
         payment_status        = case when (p_bill->>'total')::numeric = 0 then 'paid' else o.payment_status end
    from (
      select coalesce(sum(oi.line_cost), 0) as total, coalesce(bool_and(oi.unit_cost is not null), true) as complete
        from public.order_items oi where oi.order_id = v_order.id and oi.voided_at is null
    ) as s
   where o.id = v_order.id;

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

-- ---------- 8b. merge_orders_tx: voided lines left out ----------
-- Same as 0027 except the subtotal check and the cost sum skip voided lines (voided
-- lines still move to the target, for the record), and a refunded order counts as paid.
create or replace function public.merge_orders_tx(
  p_restaurant_id     uuid,
  p_staff_id          uuid,
  p_source_id         uuid,
  p_target_id         uuid,
  p_expected_subtotal numeric,
  p_bill              jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_src      public.orders;
  v_tgt      public.orders;
  v_open     int;
  v_sum      numeric;
  v_moved    int;
  v_cleared  boolean := false;
  r          record;
begin
  if p_source_id = p_target_id then
    return jsonb_build_object('ok', false, 'error', 'same_order');
  end if;

  perform 1 from public.orders
   where id in (p_source_id, p_target_id) and restaurant_id = p_restaurant_id
   order by id for update;

  select * into v_src from public.orders where id = p_source_id and restaurant_id = p_restaurant_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'order_not_found'); end if;
  select * into v_tgt from public.orders where id = p_target_id and restaurant_id = p_restaurant_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'order_not_found'); end if;

  for r in select o.id, o.status, o.table_session_id, o.paid_amount, o.refunded_amount, o.payment_status
             from public.orders o where o.id in (v_src.id, v_tgt.id)
  loop
    if r.table_session_id is null then
      return jsonb_build_object('ok', false, 'error', 'not_dine_in');
    end if;
    if not exists (select 1 from public.table_sessions s where s.id = r.table_session_id and s.cleared_at is null) then
      return jsonb_build_object('ok', false, 'error', 'order_closed');
    end if;
    if r.status in ('cancelled', 'completed', 'merged') then
      return jsonb_build_object('ok', false, 'error', 'order_closed');
    end if;
    if r.paid_amount > 0 or r.refunded_amount > 0 or r.payment_status <> 'unpaid'
       or exists (select 1 from public.order_payments p where p.order_id = r.id) then
      return jsonb_build_object('ok', false, 'error', 'already_paid');
    end if;
  end loop;

  select coalesce(sum(line_total), 0) into v_sum
    from public.order_items where order_id in (v_src.id, v_tgt.id) and voided_at is null;
  if v_sum <> p_expected_subtotal or (p_bill->>'subtotal')::numeric <> v_sum then
    return jsonb_build_object('ok', false, 'error', 'changed');
  end if;
  if (p_bill->>'subtotal')::numeric - (p_bill->>'discount_amount')::numeric
     + (p_bill->>'service_charge_amount')::numeric + (p_bill->>'tax_amount')::numeric
     + (p_bill->>'rounding_amount')::numeric <> (p_bill->>'total')::numeric then
    return jsonb_build_object('ok', false, 'error', 'bad_bill');
  end if;

  update public.order_items set order_id = v_tgt.id where order_id = v_src.id;
  get diagnostics v_moved = row_count;

  update public.orders o
     set subtotal              = (p_bill->>'subtotal')::numeric,
         discount_amount       = (p_bill->>'discount_amount')::numeric,
         service_charge_amount = (p_bill->>'service_charge_amount')::numeric,
         tax_amount            = (p_bill->>'tax_amount')::numeric,
         rounding_amount       = (p_bill->>'rounding_amount')::numeric,
         total                 = (p_bill->>'total')::numeric,
         cost_total            = s.total,
         cost_complete         = s.complete
    from (
      select coalesce(sum(oi.line_cost), 0) as total, coalesce(bool_and(oi.unit_cost is not null), true) as complete
        from public.order_items oi where oi.order_id = v_tgt.id and oi.voided_at is null
    ) as s
   where o.id = v_tgt.id;

  update public.orders
     set status = 'merged', subtotal = 0, discount_type = 'none', discount_value = 0, discount_amount = 0,
         delivery_fee = 0, service_charge_amount = 0, tax_amount = 0, rounding_amount = 0, total = 0,
         cost_total = 0, cost_complete = true
   where id = v_src.id;

  if v_src.table_session_id <> v_tgt.table_session_id then
    select count(*) into v_open from public.orders
     where table_session_id = v_src.table_session_id and status not in ('cancelled', 'merged');
    if v_open = 0 then
      update public.table_sessions set cleared_at = now() where id = v_src.table_session_id and cleared_at is null;
      v_cleared := true;
    end if;
  end if;

  insert into public.order_events (restaurant_id, order_id, staff_id, event, detail) values
    (p_restaurant_id, v_tgt.id, p_staff_id, 'merged_in',
      jsonb_build_object('source_order_id', v_src.id, 'source_order_number', v_src.order_number,
                         'items_moved', v_moved, 'old_total', v_tgt.total, 'source_total', v_src.total,
                         'new_total', (p_bill->>'total')::numeric)),
    (p_restaurant_id, v_src.id, p_staff_id, 'merged_into',
      jsonb_build_object('target_order_id', v_tgt.id, 'target_order_number', v_tgt.order_number,
                         'original_total', v_src.total, 'table_cleared', v_cleared));

  return jsonb_build_object(
    'ok', true, 'target_order_id', v_tgt.id, 'target_order_number', v_tgt.order_number,
    'source_order_number', v_src.order_number, 'items_moved', v_moved,
    'total', (p_bill->>'total')::numeric, 'source_table_cleared', v_cleared
  );
end;
$$;

revoke execute on function public.merge_orders_tx(uuid, uuid, uuid, uuid, numeric, jsonb) from public, anon, authenticated;
grant  execute on function public.merge_orders_tx(uuid, uuid, uuid, uuid, numeric, jsonb) to service_role;
