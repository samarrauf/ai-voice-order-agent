# AI Voice Order Agent

An AI phone assistant that answers a takeaway's phone and takes orders, like a member of staff would. It talks to the caller, checks the menu, confirms delivery and prices, and sends the finished order straight to the kitchen.

The demo restaurant is **Napoli Pizza & Grill**, a fictional pizza takeaway in Manchester.

## The problem it solves

On a Friday night the phone rings while everyone is busy at the counter and the oven. Calls go unanswered, and **a missed call is a lost order**: the customer just rings the next takeaway.

This agent picks up every call, even several at once. It never puts anyone on hold and it never gets a price wrong.

## How it works

1. **A customer calls** the takeaway's normal phone number.
2. **Telephony** (Twilio) receives the call and passes it to the voice platform.
3. **The voice platform** (Vapi) listens, understands what the caller says, and talks back in a natural voice.
4. **When it needs facts, it asks this app.** Examples: "Do you have a Margherita?", "Do you deliver to M14?", "Place this order." These questions go to the API endpoints below.
5. **The database** (Supabase) holds the menu, prices, delivery rules and orders. This app looks everything up there and works out the correct price.
6. **The kitchen** receives the confirmed order with an order number, and the caller hears it read back to them.

## Stack

| Part | Technology |
| --- | --- |
| App and API | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (Postgres), with Row Level Security on every table |
| Hosting | Vercel |
| Tests | Vitest |
| Voice | Vapi (Phase 4) |
| Phone number | Twilio (Phase 5) |

## API endpoints

Every `/api/tools/*` endpoint is called by the voice agent during a live call. Each one checks a secret `x-tool-secret` header first. Each reply includes a short `speech` sentence the agent can read straight to the caller.

| Endpoint | Method | What it does |
| --- | --- | --- |
| `/api/tools/search-menu` | POST | Finds the menu item the caller asked for, even when the speech-to-text misheard it (e.g. "pepperoni" heard as "pepper only"). Returns sizes and prices, or asks "Did you mean X or Y?" when the request is ambiguous. |
| `/api/tools/check-delivery` | POST | Checks whether the restaurant delivers to the caller's postcode, and gives the delivery fee and estimated time. |
| `/api/tools/create-order` | POST | Places the order. It checks opening hours, item availability, sizes, extras and the minimum delivery order. It works out every price itself, saves the order in one step, and returns an order number and a read-back for the caller. |
| `/api/menu` | GET | The public menu (categories, items, sizes, extras) for a restaurant. Read-only. |
| `/api/orders` | GET | List of orders for the upcoming kitchen board. Protected by the same secret header because it contains customer details. |

## Safety

**Prices are never trusted from the caller or the AI.** AI voice agents sometimes "hallucinate" numbers, so the agent might say a pizza costs 5.99 when it costs 9.99. This app ignores any price, subtotal or total sent to it. On every order it looks up the real prices in the database and recalculates everything on the server, in whole pence to avoid rounding errors. The agent is then told the correct total to read back.

More safeguards:

- **Secret-protected endpoints.** Only the voice platform, which holds the secret, can call the ordering tools.
- **The database admin key stays on the server.** It is never sent to a browser, and the build fails if anyone tries to use it in browser code.
- **Row Level Security** is switched on for every database table.
- **No guessing on delivery fees.** If a fee is not configured, the agent says it will check with the team. It never promises free delivery.
- **Orders are all-or-nothing.** An order and its items are saved together, so a half-saved order can't happen.

## Local setup

You need Node.js 20+ and a Supabase project.

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```
2. In the Supabase SQL Editor, run the files in `supabase/migrations/` in order, then `supabase/seed.sql` for the demo restaurant.
3. Create a file named `.env.local` in the project root with these four variables. Never commit this file:

   | Variable | Purpose |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key (safe for browsers, RLS applies) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key. **Server only**, it bypasses RLS |
   | `TOOL_API_SECRET` | A long random string the voice platform sends as the `x-tool-secret` header |

4. Start the app:
   ```bash
   npm run dev
   ```
5. Run the tests:
   ```bash
   npm test
   ```

## Status

- [x] **Phase 1: Database schema and tool API endpoints** (complete)
- [ ] **Phase 2:** Test the full ordering conversation as text
- [ ] **Phase 3:** Kitchen board and owner dashboard
- [ ] **Phase 4:** Vapi voice assistant connected to the endpoints
- [ ] **Phase 5:** Real Twilio phone number, multi-call test, demo video
