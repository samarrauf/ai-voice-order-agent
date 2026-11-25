-- 0030_bill_split.sql
-- B4c: bill split. Paste into the Supabase SQL Editor and run once. Safe to run again. Needs 0029.
--
-- 1. order_payments.payer_label: who paid this part, e.g. "Guest 2" (null = not split).
-- 2. record_payment_tx: same rules as 0029, plus two optional arguments:
--      p_payer_label  saved on the payment row;
--      p_payer_limit  the most this payer may pay in total (their share of a split bill,
--                     worked out by the server). Checked under the same order row lock,
--                     so two quick payments for one guest can never go over the share
--                     ('payer_overpayment'). The order-level rules (overpayment,
--                     already_paid, refunded, cancelled, merged, idempotency) are unchanged.
--    The old 7-argument version is dropped so there is exactly one function.
-- Only service_role may execute it (as in 0020/0029). No table grants.

-- ---------- 1. order_payments.payer_label ----------
alter table public.order_payments
  add column if not exists payer_label text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.order_payments'::regclass and conname = 'order_payments_payer_label_check') then
    alter table public.order_payments add constraint order_payments_payer_label_check
      check (payer_label is null or (char_length(payer_label) between 1 and 40));
  end if;
end $$;

-- ---------- 2. record_payment_tx ----------
drop function if exists public.record_payment_tx(uuid, uuid, text, numeric, text, text, text);

create or replace function public.record_payment_tx(
  p_restaurant_id   uuid,
  p_order_id        uuid,
  p_method          text,
  p_amount          numeric,
  p_reference       text,
  p_created_by      text,
  p_idempotency_key text,
  p_payer_label     text    default null,
  p_payer_limit     numeric default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order      public.orders;
  v_kind       text;
  v_paid       numeric(10,2);
  v_status     text;
  v_payer_paid numeric(10,2);
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

  -- A limit without a label means nothing to check against: refuse it.
  if p_payer_limit is not null and p_payer_label is null then
    return jsonb_build_object('ok', false, 'error', 'payer_label_required');
  end if;
  if p_payer_limit is not null then
    select coalesce(sum(amount), 0) into v_payer_paid
      from public.order_payments
     where order_id = p_order_id and kind = 'payment' and payer_label = p_payer_label;
    if v_payer_paid + p_amount > p_payer_limit then
      return jsonb_build_object('ok', false, 'error', 'payer_overpayment');
    end if;
  end if;

  insert into public.order_payments
    (restaurant_id, order_id, kind, method, amount, reference, created_by, idempotency_key, payer_label)
  values
    (p_restaurant_id, p_order_id, 'payment', p_method, p_amount, p_reference, p_created_by, p_idempotency_key, p_payer_label);

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

revoke execute on function public.record_payment_tx(uuid, uuid, text, numeric, text, text, text, text, numeric) from public, anon, authenticated;
grant  execute on function public.record_payment_tx(uuid, uuid, text, numeric, text, text, text, text, numeric) to service_role;
