# CLAUDE.md

Read this file at the start of every session. Also read AGENTS.md (Next.js version notes).

## Project
An AI voice agent that answers a UK takeaway's phone and takes orders. A voice platform (Vapi) calls this app's API endpoints as tools during a live phone call.

Demo restaurant: "Napoli Pizza & Grill", a fictional Manchester pizza takeaway.

Built to demo and sell to restaurant owners in the UK and Europe.

## Stack
Next.js App Router + TypeScript + Tailwind, Supabase (Postgres), Vercel, vitest.

## Non-negotiable rules
1. `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never import `lib/supabase/server.ts` into a client component. It bypasses RLS.
2. Never trust prices, totals or IDs from a request body. Always recalculate from the database. The voice agent hallucinates numbers.
3. Every `/api/tools/*` route verifies the `x-tool-secret` header before anything else.
4. Every tool response includes a short `speech` string the agent reads aloud. Prices as "8.99", never "£8.99" — text-to-speech says "pound sign".
5. Tool endpoints run mid-phone-call. Target under 300ms. No N+1 queries.
6. Menu lookups must be fuzzy and alias-aware — speech-to-text mishears food names constantly.
7. RLS stays enabled on every table.
8. This Supabase project has "automatically expose new tables" ON. RLS policies control access. Do not add GRANT statements.

## Supabase notes
Supabase renamed its API keys. The publishable key is stored in `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the secret key in `SUPABASE_SERVICE_ROLE_KEY`. These names are kept for familiarity — do not rename them.

Schema lives in `supabase/migrations/`. The owner pastes migrations into the Supabase SQL Editor manually.

## Owner
The owner is learning and does not run terminal commands himself.
- Run every command yourself.
- Explain each file in 2-3 plain sentences before writing it.
- Do not assume advanced programming knowledge.
- When a decision has a trade-off, present the options instead of silently choosing.

## Phases
- Phase 1 (current): database schema + tool API endpoints
- Phase 2: test the ordering conversation as text
- Phase 3: kitchen board + owner dashboard
- Phase 4: Vapi assistant wired to the endpoints
- Phase 5: Twilio number, concurrency test, demo video

## Commands
- `npm run dev` — start the local dev server
- `npm test` — run vitest
- `npm run build` — production build
