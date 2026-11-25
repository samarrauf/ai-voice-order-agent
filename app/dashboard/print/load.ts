import { notFound } from "next/navigation";
import { loadPrintData } from "@/lib/receipt-data";
import { requireStaffPage } from "@/lib/staff-page";
import { supabaseAdmin } from "@/lib/supabase/server";

// Shared start of both print pages: check the staff login, then load the order.
// The order must belong to the logged-in staff member's restaurant (from the
// login session); an order of any other restaurant is a 404.
export async function loadOrderOr404(orderId: string) {
  const { restaurantId } = await requireStaffPage();
  const data = await loadPrintData(orderId, restaurantId);
  if (!data) notFound();
  return data;
}

/** Print size from ?size=. 80mm thermal paper unless the link says a4. */
export const isA4 = (size: string | string[] | undefined) => size === "a4";

/** CSS @page rule: 80mm roll paper with a small margin, or A4. */
export const pageRule = (a4: boolean) =>
  a4 ? "@page{size:A4;margin:15mm}" : "@page{size:80mm auto;margin:3mm}";

/**
 * KOT of an addition (?addition=<order_events id>): the ids of the items that were added.
 * The event must be an items_added event of THIS order and THIS restaurant; anything else is a 404.
 */
export async function loadAdditionItemIds(orderId: string, eventId: string): Promise<string[]> {
  const { restaurantId } = await requireStaffPage();
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) notFound();
  const { data } = await supabaseAdmin
    .from("order_events")
    .select("detail")
    .eq("id", eventId)
    .eq("order_id", orderId)
    .eq("restaurant_id", restaurantId)
    .eq("event", "items_added")
    .maybeSingle();
  const ids = (data?.detail as { item_ids?: unknown } | undefined)?.item_ids;
  if (!Array.isArray(ids)) notFound();
  return ids.filter((x): x is string => typeof x === "string");
}
