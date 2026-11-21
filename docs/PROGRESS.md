# PROGRESS

Har stage ke aakhir mein yeh file update karna lazmi hai (status, faislay, masail, agla stage).

## Stages A1 se B10

| Stage | Kaam | Halat |
|---|---|---|
| A1 | Test hygiene | DONE (commit f54b2ad aur flaky-test fix 9bf94ba) |
| A1b | Context setup (CLAUDE.md, docs, test:pure) | CURRENT |
| A2 | P8c: staff accounts, manager role, lib/permissions.ts, password change | baqi |
| A3a | Glass design system aur naya app shell | baqi |
| A3b | Naya Home dashboard (KPI, charts, animations) | baqi |
| B1 | Menu editor aur photos | baqi |
| B2 | Cost, expenses, profit (sirf owner ko) | baqi |
| B3 | Tables aur venue management | baqi |
| B4a | Hold/resume, table badalna, merge | baqi |
| B4b | Cancel, void, refund | baqi |
| B4c | Bill split | baqi |
| B4d | WhatsApp shukriya + Google review ek-click button | baqi |
| B5 | Reports | baqi |
| B6 | Shift aur cash drawer, Z-report | baqi |
| B7 | PRA/tax design note (sirf docs) | baqi |
| B8 | Offline POS | baqi |
| B9 | Opus review (security, paisa, cost leak) | baqi |
| B10 | UI polish | baqi |

Phase C (baqi): WhatsApp agent, inbox, customer profiles, kitchen display, auto review, owner summary, Urdu UI.
Phase D (baqi): QR table ordering, rider management.

## Ab tak ke commits (purane phases P2..P9, naye A/B stages se pehle)
- P2a charges/discount/payments (c22906c, aa2b8f5, 2b21818), c88a2c6 agent order shared computeBill
- P2b Print Bill/KOT pages (27ad866), print buttons + test self-heal (2551803), receipt branding (7971ad7)
- P8a per-restaurant staff login, session tenancy (1e9c382); P8b owner settings page, audit, instant deactivation (b1f3869)
- P9a-A currency-aware money + rounding (e326ff5); P9a-B delivery areas, currency-agnostic agent (3265ef1); P9b Olive 'n Spice onboarding seed (17f5dd0)
- Test hygiene: f54b2ad (Napoli rows protect, timeouts), 9bf94ba (flaky tampered-signature test)
- Pehle: host routing (76278a9), Olive site (de4adfc..26322fd), POS terminal (76c99bc), bookings, POS foundations (441a89e), voice agent order lookup/queries

## Faislay
- Cost simple tareeqe se; cost/profit sirf owner ko.
- Extras: QR ordering aur rider handover.
- Design: glass look Olive ke theme colour mein; koi naya package nahi.
- WhatsApp button: stage B4d.
- Tests: `*.pure.test.ts` = network-free (`npm run test:pure`); baqi live Supabase par. `npm test` poora aur waisa ka waisa.

## Maloom masail
- Flaky tests: network timeouts (live Supabase); tampered-signature test pehle flaky tha (9bf94ba mein theek). Network timeout aaye to sirf wohi file akeli dobara chalao; asli failure ho to owner ko batao.
- Test hygiene: tests sirf "vitest-run-" rows par; Napoli/Olive live rows nahi; global-setup self-heal karta hai.
- Migration 0015 maujood nahi (numbering mein gap).
- Full suite slow hai (live DB); development mein test:pure + mutaliqa file.
- `lint` script `eslint` hai; type-check ke liye ab `npm run type-check`.

## Agla stage
A2 (P8c). A1b commit/push aur Vercel deploy READY ke baad.

## A1b ka khulasa
- Status: docs + scripts tayyar, commit ka intezar.
- Faislay: pure tests ka naam `*.pure.test.ts`; alag `vitest.pure.config.mts` (globalSetup nahi).
- Baqi masail: branding aur receipt tests env keys maangte hain, isliye pure nahi. Do vitest runs ek saath mat chalao: ek ka globalSetup doosre ke "vitest-run-" rows mita deta hai (full run mein staff-login 5 tests isi se fail hue, akele pass; 10 tests, 30s). Full suite ~600s.
