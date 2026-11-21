# CLAUDE.md

Har session ki shuruaat mein yeh file parho, phir AGENTS.md (Next.js version notes), phir `docs/PROGRESS.md` (agla stage) aur zarurat par `docs/ARCHITECTURE.md` (file paths ka nakshah). Poori repo dobara mat parho.

## Project
UK/Europe ke takeaways ke liye AI voice agent: Vapi live phone call mein is app ke `/api/tools/*` endpoints ko tools ki tarah bulata hai (menu search, order, booking, delivery check). Saath mein restaurant staff ka dashboard/POS (orders board, bookings, tables, settings, print bill/KOT). Demo restaurant "Napoli Pizza & Grill" (Manchester); doosra client "Olive 'n Spice" (public site + POS). Owner restaurant owners ko yeh bechna chahta hai.
Stack: Next.js 16 App Router + TypeScript + Tailwind, Supabase (Postgres), Vercel, vitest.

## Commands
- `npm run dev` dev server | `npm run build` production build
- `npm run lint` | `npm run type-check` (tsc --noEmit)
- `npm run test:pure` network-free tests (~1s), development mein bar bar
- `npm run test:file -- tests/<naam>.test.ts` ek file (live DB wali ho to .env.local chahiye)
- `npm test` poora suite (live Supabase, slow) — stage ke aakhir mein EK dafa

## Folders
- `app/api/tools/*` voice agent endpoints | `app/api/staff/*` dashboard actions | `app/dashboard/*` staff pages | `app/olive-n-spice/*` public site
- `lib/` server logic (money, order-pricing, auth, session, hosts, delivery, booking...), `lib/agent/` prompts/tools, `lib/supabase/{server,client}.ts`
- `supabase/migrations/` schema (0001...), `supabase/seed*.sql`
- `tests/` vitest (`*.pure.test.ts` = network-free), `tests/helpers/` | `scripts/` | `proxy.ts` host routing + dashboard guard
- Poora nakshah: `docs/ARCHITECTURE.md`. Stage ki halat: `docs/PROGRESS.md`.

## Standing qaide (har stage mein)
1. Reports Roman Urdu mein, 40 lines se kam, is tarteeb se: (1) kya badla (files) (2) tests (3) migration chahiye? (4) farq/sawal. Code aur comments English mein.
2. Database ki tabdeeli sirf migration/SQL file se, jo owner clipboard ke zariye Supabase SQL Editor mein khud run karta hai. Service key ya CLI se seedha schema/data mat badlo. Naye functions par `anon` aur `authenticated` ka EXECUTE revoke karo (dekho 0020). GRANT statements nahi (tables "auto expose" hain, RLS control karti hai).
3. Koi naya npm package nahi. Koi secret plain-text nahi (file, log, test, commit, report).
4. `restaurant_id` hamesha session se (`requireStaff()` / `requireStaffPage()`); body ka alag `restaurant_id` = 403. Kabhi body ya constant se nahi.
5. Paisa sirf `computeBill` (lib/order-pricing.ts) aur `formatMoney` (lib/money.ts) se. Body ki prices/totals/IDs par bharosa nahi: DB se dobara hisab.
6. Tests sirf throwaway "vitest-run-" restaurants/rows par; Napoli aur Olive ki live rows kabhi nahi badalni. Tests kabhi skip, kam ya kamzor nahi; fail ho to asal wajah theek karo.
7. Do vitest runs kabhi ek saath nahi (globalSetup doosre ke "vitest-run-" rows mita deta hai).
8. Context bachao: pehle CLAUDE.md/ARCHITECTURE.md, bade search ke liye Explore subagent, lambi output nahi (`tail`, `--reporter=dot`), development mein sirf mutaliqa tests, poora suite aakhir mein EK dafa.
9. Commit/push khud nahi. Kaam ke baad likho: "Ab commit aur push ka waqt hai. Commit message: ..." aur sirf owner ke "commit push kar do" par commit + main par push, phir Vercel deploy READY hone ka intezar.
10. Stage khatam hone par docs/PROGRESS.md update karo, phir likho "Ab /clear kar sakte hain." Context bhar raha ho to batao ke /compact ka waqt hai. Ek stage = ek session.
11. Owner programmer nahi: har command khud chalao, har file likhne se pehle 2-3 saaf jumlon mein batao, trade-off ho to options do.
12. Koi bhi process ya browser kill mat karo (taskkill, Stop-Process waghera) bina owner se poochhe.
13. Local mein session cookies (`staff_session`) khud mint/forge karne se pehle owner se poochho.

## Project ke qaide (tool endpoints)
- `SUPABASE_SERVICE_ROLE_KEY` server-only: `lib/supabase/server.ts` kabhi client component mein import nahi (RLS bypass).
- Har `/api/tools/*` route sab se pehle `x-tool-secret` verify kare (`requireToolSecret`).
- Har tool response mein chhota `speech` string; prices "8.99" likho, "£8.99" nahi (TTS "pound sign" bolta hai).
- Tool endpoints call ke dauran chalte hain: 300ms se kam, N+1 queries nahi.
- Menu lookup fuzzy aur alias-aware (speech-to-text khane ke naam galat sunta hai).
- RLS har table par enabled rahe.

## Supabase notes
Key names purane hi hain, rename mat karo: publishable key `NEXT_PUBLIC_SUPABASE_ANON_KEY`, secret key `SUPABASE_SERVICE_ROLE_KEY`. Env variable ke sirf naam: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TOOL_API_SECRET, ANTHROPIC_API_KEY, SESSION_SECRET.

## Dashboard auth
Har restaurant ke apne staff logins (`staff_accounts`, migration 0017): username + scrypt hash, role `owner`/`staff`, 5 ghalat passwords par 15 minute lock. Login se signed cookie `staff_session` (HMAC-SHA256, `SESSION_SECRET`, 12 ghante) jis mein staff id, restaurant id, role hain.
- /dashboard aur /api/staff/* ka restaurant HAMESHA session se.
- Har page load aur /api/staff/* call `staff_accounts` mein account dobara dekhta hai (`lib/staff-active.ts`): `is_active=false`, delete ya restaurant badla = foran 401; role DB se parha jata hai. Lookup fail ho to band (fail closed).
- Naya account: `node --env-file=.env.local scripts/create-staff-account.mjs --restaurant <id ya exact naam> --username <naam> --role owner|staff` (random password ek dafa chhapta hai).
- Voice agent ke `/api/tools/*` alag hain (x-tool-secret), staff login use nahi karte.
