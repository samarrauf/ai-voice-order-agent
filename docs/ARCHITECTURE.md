# ARCHITECTURE

Next 16.4.6 / React 19.3 / Supabase / vitest 5 / zod 4. Koi secret ya key ki value is file mein nahi. Naye session ke liye: pehle yahan dekho, phir sirf mutaliqa file kholo.

## 1. Top-level folders
- `app/` App Router: `api/`, `dashboard/`, `olive-n-spice/` (public site), `test-chat/`, `page.tsx`, `layout.tsx`, `globals.css`
- `components/ui/` shared UI (button, card, kpi-card, status-badge, payment-status-badge, pill-tabs, filter-chips, skeleton, empty-state, page-header, cn.ts, index.ts)
- `lib/` server logic (neeche section 2) | `data/sites/olive-n-spice/{config,hero,menu}.ts` typed site data
- `supabase/` `migrations/`, `seed.sql` (Napoli), `seed/olive-n-spice.sql`, `seed_tables.sql`
- `scripts/`, `tests/`, `test-results/`, `design-samples/` (gitignored), `public/`, `proxy.ts`, `.claude/launch.json`
- Config: `vitest.config.mts`, `vitest.pure.config.mts`, `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`

## 2. lib/ modules
- `auth.ts` requireToolSecret (x-tool-secret, hashed constant-time compare; null = ok)
- `permissions.ts` STAFF_ROLES (owner/manager/staff), CAPABILITIES map, `can(role, capability)` (pure; nav bhi use karta hai). Naye checks hamesha isi se.
- `session.ts` signed staff cookie {sid, rid, role, ver, exp}, SESSION_COOKIE="staff_session", 12h, hasRole (owner > manager > staff); `ver` na ho = 1
- `staff-auth.ts` requireStaff({role?, allowPasswordChange?}) / requireCapability / getStaffFromRequest / restaurantMismatch (API)
- `staff-page.ts` requireStaffPage({role?, allowPasswordChange?}) / requireCapabilityPage / getStaffSession / PASSWORD_PAGE (pages)
- `staff-active.ts` confirmStaffActive (DB recheck: active, restaurant, session_version, role, must_change_password; fails closed)
- `staff-login.ts` authenticateStaff (lockout 5 tries / 15 min), loadLoginState | `passwords.ts` scrypt hash, generatePassword (16 chars)
- `staff-accounts.ts` Staff API zod schemas, NEW_USERNAME, STAFF_ERRORS
- `hosts.ts` routeForHost, SITE_HOST, POS_HOST
- `money.ts` CurrencyCode (GBP/EUR/USD/PKR), CURRENCY_CONFIG, formatMoney, max*For, speechWordFor
- `order-pricing.ts` zod itemSchema, priceLines, toOrderItemsPayload, discountSchema, computeBill, billForResponse, deliveryFeePence, ROUNDING_STEPS, BILL_SETTINGS_SELECT
- `delivery.ts` delivery rules (postcode/areas/none) | `staff-delivery.ts` POS side
- `booking.ts` shared availability/create-booking | `opening-hours.ts` checkOpen | `restaurant-status.ts` open/closed + next open
- `order-lookup.ts` past order by number+phone | `caller-details.ts` junk guard
- `branding.ts` name/colours | `receipt.ts` receipt model | `receipt-data.ts` loadPrintData(orderId, restaurantId) | `print-links.ts` printBillHref/printKotHref
- `settings.ts` owner settings validation | `speech.ts` speech helpers | `timing.ts` timed/startTimer
- `agent/` system-prompt, prompt-variants, status-context, tools (voice agent prompt aur tools, per restaurant)
- `supabase/server.ts` supabaseAdmin (service role, server-only) | `supabase/client.ts` anon, browser-safe

## 3. API routes (`app/api/**/route.ts`)
- Tools (requireToolSecret): `tools/` check-availability, check-delivery, create-booking, create-order, create-order-query, lookup-order, request-callback, restaurant-status, search-menu
- Staff (requireStaff): `staff/` clear-table, manual-order, price-preview, record-payment, seat-table, settings (settings_edit), update-booking-status, update-order-status, accounts (staff_manage: create/set_role/deactivate/activate/reset_password), password (apna password, must-change mein bhi khula)
- Public: `menu` (anon client, RLS, cached); `orders` (GET list, x-tool-secret chahiye); `chat` (test-chat backend, Anthropic, tool endpoints ko TOOL_API_SECRET se bulata hai)
- Webhooks: koi nahi (Vapi seedha /api/tools/* bulata hai)

## 4. Pages aur host routing
- Pages: `/`, `/test-chat`, `/olive-n-spice` (+ menu, events, reserve), `/dashboard` (orders board) + `overview, bookings, conversations, customers, menu, pos, settings, staff, password, stats, tables, login`, `/dashboard/print/{bill,kot}/[orderId]`
- `proxy.ts` (Next 16 "proxy" = middleware) -> `lib/hosts.ts` routeForHost(host, path). SITE_HOST olive-n-spice.vercel.app: /olive-n-spice/* par rewrite, /dashboard aur /api/staff = 404. POS_HOST olive-n-spice-pos.vercel.app: "/" -> /dashboard, /olive-n-spice = 404, noindex. Baqi hosts (localhost, previews, purana domain) unchanged.
- Host se restaurant NAHI chunta; restaurant session se aata hai. Proxy /dashboard aur /api/staff par cookie check karta hai (API: 401 JSON, pages: redirect /dashboard/login). Matcher: _next, dotted files, api/ (sirf api/staff chhor kar) bahar.

## 5. Migrations (`supabase/migrations`, 0015 maujood nahi)
0001 init schema (set_updated_at, generate_order_number) | 0002 search_menu fuzzy | 0003 create_order_tx | 0004 callback_requests | 0005 pre-orders (requested_time) | 0006 bookings (generate_booking_reference, find_free_table, create_booking_tx) | 0007 order_queries | 0008 POS foundations (source, table sessions) | 0009 table session safety | 0010 branding | 0011 booking statuses | 0012 booking busy statuses | 0013 POS payments (record_payment_tx) | 0014 source/payment guards | 0016 receipt branding | 0017 staff_accounts | 0018 settings audit | 0019 update_restaurant_settings_tx | 0020 revoke settings fn | 0021 currency rounding | 0022 delivery areas | 0023 staff management (manager role, session_version, must_change_password, staff_account_events, manage_staff_account_tx, change_own_password_tx)
- RPCs code se: create_order_tx, create_booking_tx, find_free_table, record_payment_tx, search_menu, update_restaurant_settings_tx, manage_staff_account_tx, change_own_password_tx. create_order_tx kai migrations mein redefine hui (0005, 0008, 0013, 0021): hamesha sab se naya version dekho.

## 6. Auth
- Staff: `authenticateStaff` + `loadLoginState` -> `app/dashboard/login/actions.ts` signSession (ver = session_version) -> cookie; must_change_password ho to /dashboard/password. API: `requireStaff(request, {role?})` / `requireCapability(request, cap)` -> {ok, staff} ya {ok:false, response}; `restaurantMismatch()` = 403. Pages: `requireStaffPage()` / `requireCapabilityPage(cap)`. Dono `confirmStaffActive` chalate. Logout: `app/dashboard/actions.ts`.
- session_version +1: password change/reset, deactivate, role change (DB functions mein) -> purani cookies 401. must_change_password: layout har page par sirf password form dikhata hai, API 403 "password_change_required" (sirf /api/staff/password khula).
- Staff page `app/dashboard/staff` (staff-manager.tsx): naya password sirf create/reset ke response mein ek dafa; aakhri active owner ko demote/deactivate nahi; owner apne aap ko role/deactivate/reset nahi kar sakta.
- Tools: `requireToolSecret(request)` pehli line.

## 7. Order aur bill
- `priceLines` (DB se prices) -> `computeBill` (tax, service charge, discount, delivery fee, rounding step, pence integer math) -> `billForResponse`. Text mein paisa sirf `formatMoney`.
- Order banana: `/api/tools/create-order` (voice) aur `/api/staff/manual-order` (POS), dono RPC `create_order_tx` + shared computeBill. Preview: `/api/staff/price-preview`. Payment: `/api/staff/record-payment` -> `record_payment_tx`.
- Status: `/api/staff/update-order-status` (new|preparing|ready|completed; cancelled/completed final). Bookings: update-booking-status, seat-table, clear-table.

## 8. Print
`app/dashboard/print/{bill,kot}/[orderId]/page.tsx`, `load.ts` (requireStaffPage + loadPrintData), `layout.tsx`, `print-controls.tsx` (400ms baad window.print()), `print.css`. Buttons: `app/dashboard/print-buttons.tsx` (orders board, POS). Links: `lib/print-links.ts`.

## 9. Tests
- `vitest.config.mts`: tests/**/*.test.ts, node, alias `@` aur `server-only` stub, setup `tests/helpers/setup.ts` (loads .env.local), globalSetup `tests/helpers/global-setup.ts`, fileParallelism false, 90s timeouts. Route handlers seedha call hote hain, asli Supabase par.
- `vitest.pure.config.mts`: sirf `tests/**/*.pure.test.ts`, na setup na globalSetup (network/secrets nahi).
- Naming: `*.pure.test.ts` = network-free (money, rounding, speech, print-links, host-routing, staff-session, permissions, system-prompt, system-prompt-variants); baqi live DB. branding aur receipt .env keys maangte hain isliye live mein hain.
- Helpers (`tests/helpers/helpers.ts`): RID (Napoli id), ITEMS, RUN_MARKER `vitest-run-<ts>-<rand>`, db, callTool, useOpenClock/useRealClock, cleanupTestOrders, orderBody, sessionToken, staffCookie. Fixtures: `tests/fixtures/`.
- Self-heal: `global-setup.ts` run se pehle/baad "vitest-run-%" rows hata deta hai aur live Napoli columns (is_accepting_orders, opening_hours, delivery_fee, tax/service/discount percent) snapshot kar ke wapas theek karta hai.

## 10. scripts/
`conversation-tests.ts` (text conversation tests; Napoli hours temporarily all-day, backup `test-results/opening-hours-backup.json`, output `test-results/phase2-conversations.md`) | `create-staff-account.mjs` (CLAUDE.md mein usage).

## 11. Scripts aur tooling
`dev, build, start, lint (eslint 9 flat, next core-web-vitals + typescript), type-check (tsc --noEmit, strict), test, test:pure, test:file`.

## 12. Env variable naam
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TOOL_API_SECRET, ANTHROPIC_API_KEY, SESSION_SECRET (VERCEL_OIDC_TOKEN bhi .env.example mein). `.env.example` committed, `.env.local` kabhi nahi.
