import { supabaseAdmin } from "@/lib/supabase/server";
import type { PrintInput } from "@/lib/receipt";

// Loads everything a print page needs for ONE order: 3 queries run together.
// The order is looked up by id AND restaurant_id, so an order that belongs to
// another restaurant (or does not exist, or has a malformed id) returns null,
// and the page shows 404. Server-only: uses the service role key.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORDER_SELECT = `order_number, created_at, fulfilment_type, source, table_session_id,
  customer_name, customer_phone, delivery_address, delivery_postcode, notes,
  subtotal, discount_type, discount_value, discount_amount, delivery_fee,
  service_charge_amount, tax_amount, rounding_amount, total, payment_status, paid_amount, refunded_amount, status,
  order_items ( id, item_name, size_name, options, quantity, line_total, notes, created_at, voided_at ),
  table_sessions ( restaurant_tables ( table_number ) )`;

type TableRef = { table_number: string } | null;
type SessionRef = { restaurant_tables: TableRef | TableRef[] } | null;

const first = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function loadPrintData(orderId: string, restaurantId: string): Promise<PrintInput | null> {
  if (!UUID.test(orderId)) return null;

  const [orderRes, restaurantRes, paymentsRes] = await Promise.all([
    supabaseAdmin.from("orders").select(ORDER_SELECT).eq("id", orderId).eq("restaurant_id", restaurantId).maybeSingle(),
    supabaseAdmin
      .from("restaurants")
      .select(
        "name, tagline, address_line, city, postcode, phone, currency, timezone, theme_primary, theme_accent, theme_secondary, logo_url, whatsapp_number, website_url, instagram_handle, facebook_url, receipt_footer_note, rounding_step",
      )
      .eq("id", restaurantId)
      .maybeSingle(),
    supabaseAdmin
      .from("order_payments")
      .select("kind, method, amount, created_at, payer_label")
      .eq("order_id", orderId)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: true }),
  ]);

  if (orderRes.error || restaurantRes.error || paymentsRes.error) {
    console.error("print: lookup failed", orderRes.error ?? restaurantRes.error ?? paymentsRes.error);
    return null;
  }
  if (!orderRes.data || !restaurantRes.data) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- embedded relations are loosely typed by the client
  const { order_items, table_sessions, ...order } = orderRes.data as any;
  const session = first<SessionRef>(table_sessions);
  const table = first<TableRef>(session?.restaurant_tables);
  const items = [...(order_items ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  return {
    restaurant: restaurantRes.data,
    order: { ...order, table_number: table?.table_number ?? null },
    items,
    payments: paymentsRes.data ?? [],
  };
}
