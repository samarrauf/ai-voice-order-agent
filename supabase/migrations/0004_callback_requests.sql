-- Callback requests: when the agent can't help (allergen questions, errors,
-- an upset caller), it takes a name and number so a staff member can ring back.
-- Phase 3's owner dashboard will list the pending ones.

create table public.callback_requests (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  call_id         uuid references public.calls(id) on delete set null,
  customer_name   text not null,
  customer_phone  text not null,
  reason          text not null check (reason in ('allergen', 'problem', 'other')),
  details         text,
  status          text not null default 'pending' check (status in ('pending', 'done')),
  created_at      timestamptz not null default now()
);

create index callback_requests_pending_idx
  on public.callback_requests (restaurant_id, created_at)
  where status = 'pending';

-- RLS on with no policies: only the server (service role) can read or write.
-- Customer phone numbers must never be readable with the public key.
alter table public.callback_requests enable row level security;
