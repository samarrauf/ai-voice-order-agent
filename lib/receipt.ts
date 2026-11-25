import { DEFAULT_BRANDING, readableOn, sanitizeHex } from "@/lib/branding";
import { formatMoney } from "@/lib/money";

// Turns an order's saved data into a "model" for the customer receipt and the
// kitchen ticket (KOT). PURE: no database, no network, so it is easy to test.
//
// IMPORTANT: every figure comes from the bill fields saved on the order
// (subtotal, discount_amount, delivery_fee, service_charge_amount, tax_amount,
// total, paid_amount). Nothing is re-calculated here, so the paper always matches
// what the POS showed. The one derived number is "balance due" (total - paid).
// Money is formatted only through formatMoney.

type Num = number | string | null | undefined;

export type ReceiptRestaurant = {
  name: string;
  tagline?: string | null;
  address_line?: string | null;
  city?: string | null;
  postcode?: string | null;
  phone?: string | null;
  currency?: string | null;
  timezone?: string | null;
  theme_primary?: string | null;
  theme_accent?: string | null;
  theme_secondary?: string | null;
  logo_url?: string | null;
  whatsapp_number?: string | null;
  website_url?: string | null;
  instagram_handle?: string | null;
  facebook_url?: string | null;
  receipt_footer_note?: string | null;
  /** restaurants.rounding_step (0.01, 0.5, 1); only the split bills (B4c) use it. */
  rounding_step?: number | string | null;
};

export type ReceiptOrder = {
  order_number: string;
  created_at: string;
  fulfilment_type: "delivery" | "pickup";
  source?: string | null;
  table_session_id?: string | null;
  table_number?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_address?: string | null;
  delivery_postcode?: string | null;
  notes?: string | null;
  subtotal: Num;
  discount_type?: string | null;
  discount_value?: Num;
  discount_amount: Num;
  delivery_fee: Num;
  service_charge_amount: Num;
  tax_amount: Num;
  /** Rounding added to (or taken off) the bill (migration 0021). Missing or 0: no Rounding line. */
  rounding_amount?: Num;
  total: Num;
  payment_status: string;
  /** NET paid: payments minus refunds (migration 0029). */
  paid_amount: Num;
  /** Sum of refunds (B4b). Missing = 0. */
  refunded_amount?: Num;
  /** Order status; "cancelled" prints a CANCELLED line on the bill. */
  status?: string | null;
};

export type ReceiptItem = {
  /** order_items.id; the kitchen ticket of an addition picks its lines by it. */
  id?: string;
  item_name: string;
  size_name?: string | null;
  options?: unknown;
  quantity: number;
  line_total: Num;
  notes?: string | null;
  /** B4b: a voided line is left off the bill and printed as VOID on the kitchen ticket. */
  voided_at?: string | null;
};

export type ReceiptPayment = {
  /** "payment" (default) or "refund" (B4b). */
  kind?: string | null;
  method: string;
  amount: Num;
  created_at?: string | null;
  /** B4c: who paid this part of a split bill, e.g. "Guest 2". */
  payer_label?: string | null;
};

export type PrintInput = {
  restaurant: ReceiptRestaurant;
  order: ReceiptOrder;
  items: ReceiptItem[];
  payments: ReceiptPayment[];
};

export type OrderKind = "dine_in" | "takeaway" | "delivery" | "pickup";

const KIND_LABEL: Record<OrderKind, string> = {
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
  pickup: "Pickup",
};

const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card", online: "Online", other: "Other" };
const STATUS_LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
  refunded: "Refunded",
  partially_refunded: "Part refunded",
};

const num = (v: Num): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const clean = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

/** Delivery, dine-in (has a table), takeaway (staff walk-in) or pickup (phone collection). */
export function orderKind(o: Pick<ReceiptOrder, "fulfilment_type" | "source" | "table_session_id">): OrderKind {
  if (o.fulfilment_type === "delivery") return "delivery";
  if (o.table_session_id) return "dine_in";
  return o.source === "walk_in" ? "takeaway" : "pickup";
}

/** Names of the chosen options. Accepts the saved shape ({name}) and plain strings. */
export function optionNames(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  const out: string[] = [];
  for (const o of options) {
    const name = typeof o === "string" ? o : o && typeof o === "object" ? (o as { name?: unknown }).name : null;
    if (typeof name === "string" && name.trim()) out.push(name.trim());
  }
  return out;
}

/** "Mon 3 Nov 2026, 14:05" in the restaurant's own time zone. Bad zone or date never throws. */
export function formatPlacedAt(iso: string, timezone?: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  };
  try {
    return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: timezone || "Europe/London" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "Europe/London" }).format(d);
  }
}

export type ReceiptLine = { quantity: number; name: string; detail: string[]; lineTotal: string };
export type ReceiptRow = { label: string; value: string; kind?: "discount" | "total" };

/** Look and contact details for the top and bottom of the customer bill. Never used on the KOT. */
export type ReceiptBrand = {
  logoUrl: string | null;
  primary: string;
  accent: string;
  onPrimary: string;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  footerNote: string | null;
};

/** A logo may be a site path ("/brand/x.png") or an https link. Anything else (javascript:, data:, "//host") is dropped. */
export function safeLogoUrl(v: string | null | undefined): string | null {
  const s = clean(v);
  if (!s) return null;
  if (s.startsWith("/") && !s.startsWith("//") && !s.includes("\\")) return s;
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : null;
}

/** "https://www.example.com/menu/" -> "example.com/menu". Display only. */
export function displayLink(v: string | null | undefined): string | null {
  const s = clean(v);
  if (!s) return null;
  return s.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "") || null;
}

/** "olivenspice" or "@olivenspice" -> "@olivenspice". */
export function displayHandle(v: string | null | undefined): string | null {
  const s = clean(v)?.replace(/^@+/, "");
  return s ? `@${s}` : null;
}

export type ReceiptModel = {
  brand: ReceiptBrand;
  restaurantName: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  orderNumber: string;
  placedAt: string;
  kind: OrderKind;
  kindLabel: string;
  table: string | null;
  delivery: { name: string | null; phone: string | null; address: string | null } | null;
  lines: ReceiptLine[];
  rows: ReceiptRow[];
  payments: { label: string; amount: string }[];
  paid: string;
  balanceDue: string;
  paymentStatus: "unpaid" | "partial" | "paid" | "refunded" | "partially_refunded";
  /** B4b: the order was cancelled. */
  cancelled: boolean;
  paymentStatusLabel: string;
  notes: string | null;
};

/** The customer receipt. Optional lines (discount, delivery, service, tax) appear only when the saved amount is above 0. */
export function buildReceipt({ restaurant, order, items, payments }: PrintInput): ReceiptModel {
  const cur = restaurant.currency || undefined;
  const money = (n: Num) => formatMoney(num(n), cur);
  const kind = orderKind(order);

  const address = [restaurant.address_line, restaurant.city, restaurant.postcode].map(clean).filter(Boolean).join(", ");

  // Voided lines (B4b) are not part of the bill.
  const lines: ReceiptLine[] = items.filter((i) => !i.voided_at).map((i) => {
    const detail = [clean(i.size_name), ...optionNames(i.options)].filter((x): x is string => !!x);
    return { quantity: i.quantity, name: i.item_name, detail, lineTotal: money(i.line_total) };
  });

  const rows: ReceiptRow[] = [{ label: "Subtotal", value: money(order.subtotal) }];
  if (num(order.discount_amount) > 0) {
    const pct = order.discount_type === "percent" && num(order.discount_value) > 0 ? ` (${num(order.discount_value)}%)` : "";
    rows.push({ label: `Discount${pct}`, value: `-${money(order.discount_amount)}`, kind: "discount" });
  }
  if (num(order.delivery_fee) > 0) rows.push({ label: "Delivery", value: money(order.delivery_fee) });
  if (num(order.service_charge_amount) > 0) rows.push({ label: "Service charge", value: money(order.service_charge_amount) });
  if (num(order.tax_amount) > 0) rows.push({ label: "Tax", value: money(order.tax_amount) });
  // Only when the restaurant rounds its totals and this order was actually rounded.
  if (num(order.rounding_amount) !== 0) rows.push({ label: "Rounding", value: money(order.rounding_amount) });
  rows.push({ label: "TOTAL", value: money(order.total), kind: "total" });

  // Balance is whole pence arithmetic so 0.1 + 0.2 style noise never shows on paper.
  // After a refund the bill is settled: refunded money is not owed again; a cancelled order owes nothing.
  const balancePence =
    order.status === "cancelled"
      ? 0
      : Math.max(0, Math.round(num(order.total) * 100) - Math.round(num(order.paid_amount) * 100) - Math.round(num(order.refunded_amount) * 100));
  const status = (["unpaid", "partial", "paid", "refunded", "partially_refunded"] as const).find((s) => s === order.payment_status) ?? "unpaid";

  const hasDelivery = kind === "delivery";
  const primary = sanitizeHex(restaurant.theme_primary, DEFAULT_BRANDING.primary);
  return {
    brand: {
      logoUrl: safeLogoUrl(restaurant.logo_url),
      primary,
      accent: sanitizeHex(restaurant.theme_accent, DEFAULT_BRANDING.accent),
      onPrimary: readableOn(primary),
      whatsapp: clean(restaurant.whatsapp_number),
      website: displayLink(restaurant.website_url),
      instagram: displayHandle(restaurant.instagram_handle),
      facebook: displayLink(restaurant.facebook_url),
      footerNote: clean(restaurant.receipt_footer_note),
    },
    restaurantName: restaurant.name,
    tagline: clean(restaurant.tagline),
    address: address || null,
    phone: clean(restaurant.phone),
    orderNumber: order.order_number,
    placedAt: formatPlacedAt(order.created_at, restaurant.timezone),
    kind,
    kindLabel: KIND_LABEL[kind],
    table: kind === "dine_in" ? clean(order.table_number) : null,
    delivery: hasDelivery
      ? {
          name: clean(order.customer_name),
          phone: clean(order.customer_phone),
          address: [clean(order.delivery_address), clean(order.delivery_postcode)].filter(Boolean).join(", ") || null,
        }
      : null,
    lines,
    rows,
    payments: payments.map((p) =>
      p.kind === "refund"
        ? { label: `Refund (${METHOD_LABEL[p.method] ?? p.method})`, amount: `-${money(p.amount)}` }
        : { label: METHOD_LABEL[p.method] ?? p.method, amount: money(p.amount) },
    ),
    cancelled: order.status === "cancelled",
    paid: money(order.paid_amount),
    balanceDue: formatMoney(balancePence / 100, cur),
    paymentStatus: status,
    paymentStatusLabel: STATUS_LABEL[status],
    notes: clean(order.notes),
  };
}

export type KotLine = { quantity: number; name: string; options: string[]; notes: string | null; /** B4b: printed as VOID (do not make). */ voided?: true };

export type KotModel = {
  orderNumber: string;
  kindLabel: string;
  table: string | null;
  placedAt: string;
  lines: KotLine[];
  notes: string | null;
  /** True for the ticket of items added to a running order: only the NEW items, headed ADDITION. */
  addition?: true;
};

/**
 * The kitchen ticket: NO prices, NO payments, NO customer or address details.
 * With `additionItemIds` only those items are listed (an ADDITION ticket); the older
 * items are not printed again and the order note (already sent) is left out.
 */
export function buildKot({ restaurant, order, items }: PrintInput, additionItemIds?: readonly string[]): KotModel {
  const kind = orderKind(order);
  const ids = additionItemIds ? new Set(additionItemIds) : null;
  if (ids) items = items.filter((i) => !!i.id && ids.has(i.id));
  return {
    orderNumber: order.order_number,
    kindLabel: KIND_LABEL[kind],
    table: kind === "dine_in" ? clean(order.table_number) : null,
    placedAt: formatPlacedAt(order.created_at, restaurant.timezone),
    lines: items.map((i) => ({
      quantity: i.quantity,
      name: i.item_name,
      options: [clean(i.size_name), ...optionNames(i.options)].filter((x): x is string => !!x),
      notes: clean(i.notes),
      ...(i.voided_at ? { voided: true as const } : {}),
    })),
    notes: ids ? null : clean(order.notes),
    ...(ids ? { addition: true as const } : {}),
  };
}
