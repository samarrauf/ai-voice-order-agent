import { vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Shared test helpers. Tests talk to the REAL Supabase project.

export const RID = "11111111-1111-1111-1111-111111111111";
export const ITEMS = {
  margherita: "33333333-0000-0000-0000-000000000001",
  pepperoni: "33333333-0000-0000-0000-000000000002",
  garlicBread: "33333333-0000-0000-0000-000000000021",
  coleslaw: "33333333-0000-0000-0000-000000000045",
};

/** Unique per test run. Every order a test creates carries it in `notes`,
 *  so cleanup deletes ONLY test rows — never A-1001 / A-1002. */
export const RUN_MARKER = `vitest-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Our own service-role client, for checking and restoring rows. */
export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type Handler = (req: Request) => Promise<Response>;

/** Calls a route handler like Vapi would. secret: undefined = correct one, null = header missing. */
export async function callTool(
  handler: Handler,
  body: unknown,
  secret: string | null | undefined = undefined,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-tool-secret"] = secret ?? process.env.TOOL_API_SECRET!;
  const res = await handler(
    new Request("http://localhost/api/tools/test", { method: "POST", headers, body: JSON.stringify(body) }),
  );
  return { status: res.status, json: await res.json() };
}

/** Freeze only the clock (not timers, so network calls still work) at a time
 *  the restaurant is open: Wednesday 18:00 London. Tests never depend on the
 *  real time of day. Call useRealClock() afterwards. */
export function useOpenClock() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T18:00:00Z")); // Wed, GMT = London in November
}
export function useRealClock() {
  vi.useRealTimers();
}

/** Delete every order this run created (order_items cascade with them). */
export async function cleanupTestOrders() {
  const { error } = await db.from("orders").delete().like("notes", `${RUN_MARKER}%`);
  if (error) throw error;
}

/** A valid delivery body; override any field per test. */
export function orderBody(overrides: Record<string, unknown> = {}) {
  return {
    restaurant_id: RID,
    call_id: null,
    fulfilment_type: "delivery",
    customer_name: "Vitest Customer",
    customer_phone: "07700900123",
    delivery_address: "12 Test Street, Manchester",
    delivery_postcode: "M14 5TP",
    payment_method: "cash",
    notes: RUN_MARKER,
    items: [
      { menu_item_id: ITEMS.pepperoni, size_name: "12 inch", quantity: 2, options: ["Extra cheese"], notes: null },
      { menu_item_id: ITEMS.garlicBread, size_name: null, quantity: 1, options: [], notes: null },
    ],
    ...overrides,
  };
}
