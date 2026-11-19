import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// SELF-HEAL: runs ONCE before the whole test run (a "beforeAll" for every file).
// If an earlier run was stopped half-way, its afterAll/finally cleanup never ran
// and left test rows (and maybe a null delivery fee) in the live database. Those
// break the next run, so we tidy up first. Only rows carrying the "vitest-run-"
// marker are touched, never real orders, bookings or callbacks.

const RID = "11111111-1111-1111-1111-111111111111"; // Napoli (supabase/seed.sql)
const SEED_DELIVERY_FEE = 2.5; // supabase/seed.sql
const MARKER = "vitest-run-%";

// A test that switches orders off must never leave them off: the demo phone line
// would stop taking orders. Put it back to true if a stopped run left it false.
async function restoreAcceptingOrders(db: SupabaseClient) {
  const r = await db.from("restaurants").update({ is_accepting_orders: true }).eq("id", RID).eq("is_accepting_orders", false).select("id");
  if (r.error) throw r.error;
  if (r.data?.length) console.log("[self-heal] restored is_accepting_orders to true");
}

export default async function selfHeal() {
  process.loadEnvFile(".env.local");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await restoreAcceptingOrders(db);

  const leftovers = await Promise.all([
    db.from("bookings").delete().like("menu_preferences", MARKER).select("id"),
    db.from("orders").delete().like("notes", MARKER).select("id"), // order_items cascade
    db.from("callback_requests").delete().like("details", MARKER).select("id"),
  ]);
  for (const r of leftovers) if (r.error) throw r.error;
  // After the bookings are gone: the throwaway tables (their seating sessions go
  // with them) and the throwaway restaurant made by tests/update-booking-status.test.ts.
  const tables = await db.from("restaurant_tables").delete().like("table_number", MARKER).select("id");
  if (tables.error) throw tables.error;
  // Test staff logins (their restaurants' delete would remove them too, this is just explicit).
  const accounts = await db.from("staff_accounts").delete().like("username", MARKER).select("id");
  if (accounts.error) throw accounts.error;
  const restaurants = await db.from("restaurants").delete().like("name", MARKER).select("id");
  if (restaurants.error) throw restaurants.error;
  const removed = [...leftovers, tables, accounts, restaurants].reduce((n, r) => n + (r.data?.length ?? 0), 0);

  const fee = await db
    .from("restaurants")
    .update({ delivery_fee: SEED_DELIVERY_FEE })
    .eq("id", RID)
    .is("delivery_fee", null)
    .select("id");
  if (fee.error) throw fee.error;

  if (removed || fee.data?.length) {
    console.log(
      `[self-heal] removed ${removed} leftover test row(s)` +
        (fee.data?.length ? `, restored delivery_fee to ${SEED_DELIVERY_FEE}` : ""),
    );
  }

  // Runs after the whole test run: leave the restaurant taking orders.
  return async () => {
    await restoreAcceptingOrders(db);
    // The throwaway staff logins sessionToken() made for the demo restaurant.
    await db.from("staff_accounts").delete().like("username", MARKER);
  };
}
