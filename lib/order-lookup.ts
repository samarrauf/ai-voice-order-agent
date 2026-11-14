import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/speech";

// Finds a past order for a caller. SECURITY: the order number AND the caller's
// phone must both match, so nobody can read someone else's order by guessing
// order numbers. A miss is always the same `null`, whatever the reason (wrong
// number, wrong phone, other restaurant), so a caller can't probe which order
// numbers exist.

export type FoundOrder = {
  id: string;
  order_number: string;
  created_at: string;
  fulfilment_type: "delivery" | "pickup";
  status: string;
  total: number;
  items: { name: string; quantity: number }[];
};

/** "a 1001" / "a-1001" / "A1001" -> "A-1001". Anything else is just uppercased. */
export function normalizeOrderNumber(raw: string): string {
  const t = raw.trim().toUpperCase();
  const m = t.match(/^([A-Z])[\s-]*(\d+)$/);
  return m ? `${m[1]}-${m[2]}` : t;
}

/** Last 10 digits, so "+447700900123" and "07700900123" compare equal. */
function phoneKey(raw: string): string {
  return normalizePhone(raw).replace(/\D/g, "").slice(-10);
}

export async function findOrderForCaller(
  restaurantId: string,
  orderNumber: string,
  customerPhone: string,
): Promise<FoundOrder | null> {
  const key = phoneKey(customerPhone);
  if (key.length < 10) return null;

  // One query: the order plus its items (no N+1).
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, created_at, fulfilment_type, status, total, customer_phone, order_items(item_name, quantity)",
    )
    .eq("restaurant_id", restaurantId)
    .eq("order_number", normalizeOrderNumber(orderNumber))
    .maybeSingle();

  if (error) throw error;
  if (!data || !data.customer_phone || phoneKey(data.customer_phone) !== key) return null;

  return {
    id: data.id,
    order_number: data.order_number,
    created_at: data.created_at,
    fulfilment_type: data.fulfilment_type,
    status: data.status,
    total: Number(data.total),
    items: (data.order_items ?? []).map((i: { item_name: string; quantity: number }) => ({
      name: i.item_name,
      quantity: i.quantity,
    })),
  };
}

/** Same words for every kind of miss. No pound sign: text-to-speech would say "pound sign". */
export const ORDER_NOT_FOUND_SPEECH =
  "Sorry, I can't find an order with those details. Could you check the order number and the phone number you ordered with?";
