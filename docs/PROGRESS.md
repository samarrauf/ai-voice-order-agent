# PROGRESS

Har stage ke aakhir mein yeh file update karna lazmi hai (status, faislay, masail, agla stage).

## Stages A1 se B10

| Stage | Kaam | Halat |
|---|---|---|
| A1 | Test hygiene | DONE (commit f54b2ad aur flaky-test fix 9bf94ba) |
| A1b | Context setup (CLAUDE.md, docs, test:pure) | DONE (6267b95) |
| A2 | P8c: staff accounts, manager role, lib/permissions.ts, password change | DONE (commit "P8c: staff management...") |
| A3a | Glass design system aur naya app shell | baqi |
| A3b | Naya Home dashboard (KPI, charts, animations) | baqi |
| B1 | Menu editor aur photos | baqi |
| B2 | Cost, expenses, profit (sirf owner ko) | DONE, commit ka intezar |
| B3 | Tables aur venue management | baqi |
| B4a | Hold/resume, table badalna, merge | DONE, commit ka intezar |
| B4a+ | Tables card: Items jodo / Payment lo / Bill print, payment ke baad Clear table, Clear anyway (owner/manager) | DONE, commit ka intezar |
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

## P7 (Menu editor) ka khulasa
- Status: migration 0024 owner ne run ki; /dashboard/menu (menu_edit: owner+manager), /api/staff/menu aur /menu/photo, lib/menu-admin.ts; lint, type-check, build aur poora suite (48 files, 763 tests) pass; commit ka intezar.
- Faislay: delete = archive (archived_at), order_items ka snapshot purane orders ko mehfooz rakhta hai; category archive us ke items bhi archive karta hai; item save ek DB function (save_menu_item_tx) mein, har field ki tabdeeli menu_changes mein; photo sirf server route se (bucket "menu-photos", public read, koi write policy nahi).
- Faislay: Menu nav ab sirf menu_edit walon ko; staff ko 403. Olive ki website menu.ts se chalti hai, untouched.
- Baqi masail: archive ka undo/restore nahi; naye item par photo save ke baad lagti hai; Olive ki menu.ts aur DB menu alag hain; menu_changes ka koi viewer page nahi; menu_items.image_url abhi POS/agent/website par dikhai nahi jati.
- Restore: Menu page par "Archived" hissa; item_restore/category_restore (/api/staff/menu, koi migration nahi). Category restore sirf wohi items wapas laata hai jin ka archived_at category ke barabar hai; duplicate naam 409; archived category ka item pehle category restore maangta hai. menu_changes mein likha jata hai.
- Test hygiene: orders restaurants se cascade nahi hote, isliye throwaway restaurant hatane se pehle orders hatao.

## P3a (Tables & venue) ka khulasa
- Status: migration 0026 owner ne run ki; /dashboard/tables (live floor sab roles ko, editor tables_edit: owner+manager), /api/staff/tables, lib/tables.ts (pure), lib/tables-data.ts; tests/tables.pure.test.ts + tables-venue.test.ts (25) pass; lint, type-check pass; poora suite (52 files, 855 tests) aur build pass; commit ka intezar.
- Faislay: table delete nahi, sirf switch off (is_active); off tab hi hota hai jab koi baitha na ho aur aane wali confirmed booking na ho (90 min ke andar ki bhi). Seats chhoti karna bhi booked/baithi party se neeche nahi. Section off sirf jab us mein active table na ho; section id ka restaurant DB ke composite FK se bhi check hota hai.
- Faislay: find_free_table, create_booking_tx (party_too_large sirf active tables par), seat-table, POS tables aur Home ka table count sirf is_active; 90 minute aur busy-status logic waisa hi. Floor se Clear table booking wale session par booking ko completed bhi karta hai (warna 90 min busy rehti).
- Baqi masail: deactivate ka check aur update alag steps hain (booking beech mein aa jaye to bahut kam imkaan, race); floor ka UI browser mein login ke sath dekha nahi gaya (staff cookie banane se pehle poochna hota hai); section reorder up/down buttons se, drag nahi; table delete ka koi raasta nahi.

## Agla stage
B5 (Reports: dashboard-stats aur lib/profit-data.ts ka wahi hisaab), B10 (har page ka andar ka look naye glass design mein). P3a (Tables) ho gaya. Navigation mein naya page lib/nav.ts mein ek line se judta hai. B2 commit/push ke baad.

## B2 (cost, expenses, profit) ka khulasa
- Status: migration 0025 owner ne run ki; menu editor mein Cost (owner), POS/Orders board par owner ki "Cost · Profit" line, Home par Net profit card, /dashboard/expenses (add, filter, void, summary); lint, type-check, build, poora suite pass.
- Faislay: cost alag private table menu_costs mein (menu tables public hain); snapshot create_order_tx DB mein nikalta hai; size chuna ho to sirf size ki cost (item ki cost par fallback nahi); extra ki cost khaali = "maloom nahi" (0 likhna hoga); cost_total = maloom lines ka jod, cost_complete batata hai.
- Faislay: munafa = subtotal - discount - cost_total (delivery, service, tax, rounding bahar; cancelled bahar); manager ki menu save cost ko naam se mila kar mehfooz rakhti hai; cost menu_changes mein nahi likhi jati; kharcha void hota hai, delete nahi.
- Baqi masail: purane orders ki cost null (backfill nahi); category/restaurant-level extras ki cost editor se set nahi hoti; kharchon ki category ko band/rename karne ka UI nahi; Expenses page pehli visit par default categories banata hai.
- Agla: B5 Reports (charts) loadProfitSummary aur dashboard-stats ka hisaab use kare.

## B4a (hold/resume, table badalna, merge) ka khulasa
- Status: migration 0027 owner ne run ki (held_carts, order_events, orders.status 'merged', move_table_tx, merge_orders_tx, record_payment_tx + merged); POS mein Hold / Held orders, Tables page par Move table / Merge orders; lint, type-check, build, naye tests pass.
- Faislay: hold ka quote server rakhta hai (browser ki qeemat ignore), resume par dobara hisab aur farq dikhta hai; resume held cart ko usi statement mein hata deta hai (do staff ek cart resume nahi kar sakte). Move = session ki table badalti hai, order number wahi; seats kam hon to sirf warning; double-seating ka partial index barqarar.
- Faislay: merge target order ke discount ke sath sab items ka computeBill dobara; source 'merged' (paisa zero, items target mein), sales/profit/board/tables bill se bahar (isExcludedStatus); payment wale, cancelled/completed/merged ya takeaway order merge nahi hote; source table tabhi free jab us par aur live order na ho. order_events: table_moved, merged_in, merged_into.
- Baqi masail: source ka discount merge mein nahi jata (sirf target ka); held cart resume ke baad browser band ho jaye to cart chala jata hai; order_events ka dekhne wala UI nahi (aglay stages); move/merge ka UI Tables page par hai, POS table picker mein nahi.

## A3b (Home dashboard) ka khulasa
- Status: Home /dashboard par, orders board /dashboard/orders par (nav: Home, Orders); lib/dashboard-stats.ts (pure hisaab), lib/dashboard-home.ts (loader + role gate), components/charts (CapsuleBars, Donut, Gauge, Sparkline), CountUp; lint, type-check, build, naye tests pass.
- Faislay: Sales = total - tax_amount, cancelled bahar (Reports bhi yahi use kare); muddat restaurant ki timezone se (Aaj = raat 12 se, business_day_start B5 mein); staff ko sales/reports ka koi field nahi (loader query hi nahi karta); order type = table_session/table_booking dine-in, delivery, baqi takeaway.
- Baqi masail: mahine ka data 1000-row pages mein padha jata hai (SQL aggregate B5 mein); staff ka screenshot nahi bana (live staff account nahi); Overview placeholder page abhi nav mein hai (B5 mein Reports se badlega).

## A3a2 (theme ke teeno rang) ka khulasa
- Status: resolveTheme (lib/color.ts), lib/chart-palette.ts (--chart-1..8), lib/brand-logo.ts, top bar mein logo badge, globals.css naye tokens (brand/sage/highlight), lite mode theme se; lint, type-check, build, pure tests (+theme.pure.test.ts) pass. Poora suite: 681 pass + olive-onboarding.test.ts (live data ke mutabiq mazboot kiya, 12 pass); commit ka intezar.
- Faislay: brand=primary (buttons, active), sage=secondary (chips, inactive, borders), highlight=accent (qeematein, totals, notification dot); canvas primary ka bohat gehra tint; Napoli ke apne rang (slate/neela). Purani accent classes brand/highlight mein badli (bg-accent -> bg-brand waghera).
- Faislay: chart palette = brand + sage + highlight + unse bane rang, farthest-first (min deltaE 14), red-green paas paas nahi, 3:1; abhi koi chart nahi (A3b). KpiCard mein optional tone 1-8.
- Baqi masail: olive-onboarding.test.ts ab cookie DB ke session_version se banata hai aur owner-editable settings ka behaviour (max discount) check karta hai, fixed facts sakht. Dev warning (purana): verifySession mein Date.now() prerender.
- Screenshots design-samples/a3a2/ (gitignored). resolveAccent ab layout mein use nahi hota (tests ke liye rakha).

## A3a (glass design system) ka khulasa
- Status: tokens (globals.css), lib/color.ts, lib/nav.ts, lib/lite-mode.ts, naye components/ui, app-shell.tsx (sidebar, top bar, avatar menu) aur login ka naya look tayyar; lint, type-check, build, poora suite pass; commit ka intezar. Screenshots design-samples/a3a/ (gitignored).
- Faislay: purane tokens (surface/line/ink) hi glass values par le gaye, is liye saare purane pages khud naye look mein; accent resolveAccent() se (AA text, bohat gaharay accent halke kiye jate hain); print pages/readableOn/print.css untouched.
- Faislay: Lite mode = html[data-lite] (blur/animation band, splash hidden); default weak device (<=4 cores) ya reduced-motion; user ka choice localStorage "dash-lite" mein, page paint se pehle inline script lagu karti hai.
- Baqi masail: Orders page par apna "New Order" button top bar ke saath doharaya hai (B10 mein hataya jaye); search bar abhi nahi; Fraunces font hata diya (headings bhi Plus Jakarta Sans).

## A2 (P8c) ka khulasa
- Status: migration 0023 owner ne run ki; lint, type-check, poora suite (38 files, 611 tests) aur build pass; commit ka intezar.
- Faislay: capabilities sirf `lib/permissions.ts` mein; cookie mein `ver` (bina ver = 1, deploy par logout nahi); password change/reset, deactivate, role change = version +1; activate version nahi badhata.
- Faislay: owner apne aap ko role/deactivate/reset nahi kar sakta ('self'); aakhri active owner protected; reset login lock bhi hata deta hai; naya password 16 chars, sirf ek response mein.
- Must-change: layout har page par sirf password form, API 403 `password_change_required`; nav link `app/dashboard/nav-links.tsx` mein (lib/nav.ts A3a mein banega).
- Security fix: password page ka ghalat "current password" ab login wale lockout counter mein (checkOwnPassword, 5 ghalat = 15 min lock, 429 "locked"); sahi password counter saaf karta hai.
- Security fix: anon key se dono staff functions par 42501 permission denied ka test; authenticated role ka check owner ke SQL Editor wale read-only query se (test mein user JWT nahi). Baqi: `create-staff-account.mjs` sirf owner/staff.

## A1b ka khulasa
- Status: docs + scripts tayyar, commit ka intezar.
- Faislay: pure tests ka naam `*.pure.test.ts`; alag `vitest.pure.config.mts` (globalSetup nahi).
- Baqi masail: branding aur receipt tests env keys maangte hain, isliye pure nahi. Do vitest runs ek saath mat chalao: ek ka globalSetup doosre ke "vitest-run-" rows mita deta hai (full run mein staff-login 5 tests isi se fail hue, akele pass; 10 tests, 30s). Full suite ~600s.

## A3a Olive brand colours
- Olive logo ka asli rang gold #CFB12C (+ hara #009147); DB theme gold #C9A227 usi family ka hai, isliye DB nahi badli. `lib/color.ts` mein 3 darje (button, highlight, ink) aur `lib/login-theme.ts` (host se login: POS host = Olive logo+naam+gold, baqi neutral grey). Gradient `.glass-accent` halka kiya.
- Tests: color.pure + login-theme.pure naye (pure suite 13 files pass). Screenshots: design-samples/a3a-olive/.

## B4a+ Tables card shortcuts
- Busy table card: "Items jodo" (`/dashboard/pos?table=<id>`, POS usi table ki session par dine-in khulta hai), "Payment lo" (mojooda `PaymentDialog` + `/api/staff/record-payment`, `take_payment`), "Bill print" (`printBillHref`, `print_bill`). Har unpaid order ka apna Payment button.
- "Clear table" sirf jab saare orders poori tarah paid (ya table par koi order nahi). Table khud clear nahi hota. Helpers pure: `lib/tables.ts` (owedPence, unpaidOrders, readyToClear, busyTableActions, tableForPos). Tests: `tests/table-card-actions.pure.test.ts`.
- "Clear anyway" (bill baaki, customer chala gaya): sirf owner/manager (naya capability `clear_unpaid`), confirm dialog mein baaki raqam. Mojooda `/api/staff/clear-table` mein `clear_unpaid: true`; staff ko server par 403. Har baaki order par `order_events` mein `cleared_unpaid` (kaun, order, baaki, total); order Orders board par rehta hai.
- Tests: `tests/clear-anyway.test.ts` (live) + pure additions. Koi migration nahi. Note: bina flag ke plain clear server par ab bhi payment check nahi karta (bookings board bhi use karta hai).
