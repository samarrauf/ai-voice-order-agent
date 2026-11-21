import { existsSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// SELF-HEAL: runs ONCE before the whole test run and once after it.
// If an earlier run was stopped half-way (network drop, Ctrl+C), its afterAll/finally
// cleanup never ran and may have left (a) test rows and (b) a CHANGED live Napoli row
// (opening hours, orders switched off, delivery fee null). Both break the next run,
// so we tidy up first. Only rows carrying the "vitest-run-" marker are deleted, never
// real orders, bookings or callbacks. Napoli's settings are only ever put back, never
// invented: see healNapoli() and the snapshot below.

const RID = "11111111-1111-1111-1111-111111111111"; // Napoli (supabase/seed.sql)
const SEED_DELIVERY_FEE = 2.5; // supabase/seed.sql
const MARKER = "vitest-run-%";
const BACKUP_PATH = "test-results/opening-hours-backup.json"; // written by scripts/conversation-tests.ts

// supabase/seed.sql: the last-resort hours if no backup file exists.
const SEED_HOURS = {
  mon: [{ open: "16:00", close: "23:00" }],
  tue: [{ open: "16:00", close: "23:00" }],
  wed: [{ open: "16:00", close: "23:00" }],
  thu: [{ open: "16:00", close: "23:00" }],
  fri: [{ open: "16:00", close: "00:00" }],
  sat: [{ open: "16:00", close: "00:00" }],
  sun: [{ open: "16:00", close: "22:30" }],
};

/** The "open all day, every day" hours that scripts/conversation-tests.ts sets temporarily. */
const isAllDay = (h: unknown) => {
  if (!h || typeof h !== "object") return false;
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return days.every((d) => {
    const slots = (h as Record<string, unknown>)[d];
    return Array.isArray(slots) && slots.length === 1 && slots[0]?.open === "00:00" && slots[0]?.close === "00:00";
  });
};

// Napoli columns a test could touch. Snapshot at the start, compared again at the end.
const GUARDED = ["is_accepting_orders", "opening_hours", "delivery_fee", "tax_rate_percent", "service_charge_percent", "max_discount_percent"] as const;
type Snapshot = Record<(typeof GUARDED)[number], unknown>;

async function readNapoli(db: SupabaseClient): Promise<Snapshot> {
  const r = await db.from("restaurants").select(GUARDED.join(", ")).eq("id", RID).single();
  if (r.error) throw r.error;
  return r.data as unknown as Snapshot;
}

/** Put back the known-good values a stopped run could have left behind. */
async function healNapoli(db: SupabaseClient) {
  const fixed: string[] = [];
  const now = await readNapoli(db);
  const patch: Record<string, unknown> = {};

  // A test that switches orders off must never leave them off: the demo phone line would stop taking orders.
  if (now.is_accepting_orders === false) {
    patch.is_accepting_orders = true;
    fixed.push("is_accepting_orders=true");
  }
  if (now.delivery_fee === null) {
    patch.delivery_fee = SEED_DELIVERY_FEE;
    fixed.push(`delivery_fee=${SEED_DELIVERY_FEE}`);
  }
  // Open-all-day hours are only ever a conversation-test leftover. Prefer the backup that
  // script wrote; fall back to the seed hours.
  if (isAllDay(now.opening_hours)) {
    let hours: unknown = SEED_HOURS;
    if (existsSync(BACKUP_PATH)) {
      try {
        const saved = JSON.parse(readFileSync(BACKUP_PATH, "utf8"));
        if (saved && !isAllDay(saved)) hours = saved;
      } catch {
        /* unreadable backup: keep the seed hours */
      }
    }
    patch.opening_hours = hours;
    fixed.push("opening_hours (from backup/seed)");
  }

  if (Object.keys(patch).length) {
    const r = await db.from("restaurants").update(patch).eq("id", RID);
    if (r.error) throw r.error;
    console.log(`[self-heal] Napoli restored: ${fixed.join(", ")}`);
  }
}

/** Delete throwaway rows. Children are removed explicitly (delivery_areas, settings_audit,
 *  order_payments, staff_account_events, staff_accounts), even though deleting their restaurant would cascade. */
async function removeLeftovers(db: SupabaseClient) {
  const leftovers = await Promise.all([
    db.from("bookings").delete().like("menu_preferences", MARKER).select("id"),
    db.from("orders").delete().like("notes", MARKER).select("id"), // order_items, order_payments, order_queries cascade
    db.from("callback_requests").delete().like("details", MARKER).select("id"),
  ]);
  for (const r of leftovers) if (r.error) throw r.error;
  // After the bookings are gone: the throwaway tables (their seating sessions go with them).
  const tables = await db.from("restaurant_tables").delete().like("table_number", MARKER).select("id");
  if (tables.error) throw tables.error;
  const accounts = await db.from("staff_accounts").delete().like("username", MARKER).select("id");
  if (accounts.error) throw accounts.error;

  // Throwaway restaurants, and every table that points at them. Never Napoli or Olive: they do not match the marker.
  const found = await db.from("restaurants").select("id").like("name", MARKER);
  if (found.error) throw found.error;
  const ids = (found.data ?? []).map((x) => x.id).filter((id) => id !== RID);
  const children: { data: unknown[] | null; error: unknown }[] = [];
  if (ids.length) {
    for (const table of ["order_payments", "settings_audit", "delivery_areas", "staff_account_events", "staff_accounts"]) {
      children.push(await db.from(table).delete().in("restaurant_id", ids).select("id"));
    }
  }
  for (const r of children) if (r.error) throw r.error;
  const restaurants = ids.length ? await db.from("restaurants").delete().in("id", ids).select("id") : { data: [], error: null };
  if (restaurants.error) throw restaurants.error;

  return [...leftovers, tables, accounts, ...children, restaurants].reduce((n, r) => n + (r.data?.length ?? 0), 0);
}

export default async function selfHeal() {
  process.loadEnvFile(".env.local");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await healNapoli(db);
  const removed = await removeLeftovers(db);
  if (removed) console.log(`[self-heal] removed ${removed} leftover test row(s)`);

  // The state Napoli should be in when the run ends (taken AFTER the heal above).
  const snapshot = await readNapoli(db);

  // Runs after the whole test run: if anything about Napoli moved, put it back.
  return async () => {
    try {
      const now = await readNapoli(db);
      const patch: Record<string, unknown> = {};
      for (const k of GUARDED) if (JSON.stringify(now[k]) !== JSON.stringify(snapshot[k])) patch[k] = snapshot[k];
      if (Object.keys(patch).length) {
        const r = await db.from("restaurants").update(patch).eq("id", RID);
        if (r.error) throw r.error;
        console.log(`[self-heal] Napoli changed during the run, restored: ${Object.keys(patch).join(", ")}`);
      }
      await healNapoli(db); // belt and braces: never leave orders off / fee null / all-day hours
      await removeLeftovers(db); // the staff logins sessionToken() made, any stragglers
    } catch (e) {
      console.error("[self-heal] end-of-run cleanup failed (next run's start will retry):", e);
    }
  };
}
