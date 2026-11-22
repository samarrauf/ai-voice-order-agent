import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  BILL_SETTINGS_SELECT,
  MENU_ITEM_SELECT,
  OPTION_SELECT,
  computeBill,
  pounds,
  priceLines,
  type BillSettingsRow,
  type DbItem,
  type DbOption,
} from "@/lib/order-pricing";
import type { DeliveryAreaRow } from "@/lib/delivery";
import { activeDeliveryAreas, staffDeliveryCheck } from "@/lib/staff-delivery";
import {
  compareQuotes,
  heldCartSchema,
  holdBodySchema,
  heldIdBodySchema,
  heldListBodySchema,
  type HeldCart,
  type HeldCartRecord,
  type HeldQuote,
} from "@/lib/held-carts";

// Staff action: put a POS cart aside (hold), list the held carts, take one back
// (resume) or throw it away (delete). Capability hold_order (every role).
//
// A held cart holds NO prices from the browser. When it is held the server prices it
// (same shared code as the real order) and keeps that quote; on resume it prices the
// cart again from today's menu and says what changed. A held cart belongs to the
// restaurant of the login session: another restaurant's id is simply "not found".
// Resume removes the held cart in the same statement that reads it, so two staff
// can never both resume the same cart.

const bodySchema = z.discriminatedUnion("action", [holdBodySchema, heldIdBodySchema, heldListBodySchema]);

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });
const MAX_HELD = 50;

type Priced = { quote: HeldQuote | null; keptIndexes: number[]; unitPrices: number[]; removed: { name: string; reason: string }[] };

/** Prices every line of `cart` from today's menu. A line that can no longer be priced is dropped (and named), not fatal. */
async function repriceCart(rid: string, cart: HeldCart): Promise<Priced | { error: string }> {
  const isDelivery = cart.orderType === "delivery";
  const itemIds = [...new Set(cart.lines.map((l) => l.menuItemId))];
  const [itemsRes, optionsRes, settingsRes, areasRes] = await Promise.all([
    supabaseAdmin.from("menu_items").select(MENU_ITEM_SELECT).eq("restaurant_id", rid).is("archived_at", null).in("id", itemIds),
    supabaseAdmin.from("item_options").select(OPTION_SELECT).eq("restaurant_id", rid),
    supabaseAdmin.from("restaurants").select(`${BILL_SETTINGS_SELECT}, delivery_mode`).eq("id", rid).maybeSingle(),
    isDelivery ? activeDeliveryAreas(rid) : Promise.resolve({ data: [] as DeliveryAreaRow[], error: null }),
  ]);
  if (itemsRes.error || optionsRes.error || settingsRes.error || areasRes.error || !settingsRes.data) {
    console.error("held-carts: lookup failed", itemsRes.error ?? optionsRes.error ?? settingsRes.error ?? areasRes.error);
    return { error: "database lookup failed" };
  }
  const menuById = new Map((itemsRes.data as unknown as DbItem[]).map((m) => [m.id, m]));
  const options = optionsRes.data as DbOption[];

  const keptIndexes: number[] = [];
  const unitPrices: number[] = [];
  const kept: { menu_item_id: string; size_name: string | null; quantity: number; options: string[] }[] = [];
  const removed: Priced["removed"] = [];
  cart.lines.forEach((l, index) => {
    const req = { menu_item_id: l.menuItemId, size_name: l.sizeName, quantity: l.quantity, options: l.options };
    const one = priceLines([req], menuById, options);
    if (!one.ok) {
      removed.push({ name: l.name, reason: one.error });
      return;
    }
    keptIndexes.push(index);
    unitPrices.push(pounds(one.lines[0].unitPence));
    kept.push(req);
  });
  if (kept.length === 0) return { quote: null, keptIndexes, unitPrices, removed };

  const all = priceLines(kept, menuById, options);
  if (!all.ok) return { error: all.error };
  const discountValue = Number(cart.discountValue);
  const discount =
    cart.discountType === "none" || !(discountValue > 0)
      ? { type: "none" as const, value: 0, reason: null }
      : { type: cart.discountType, value: discountValue, reason: cart.discountReason.trim() || null };
  const delivery = staffDeliveryCheck(
    isDelivery,
    settingsRes.data as unknown as BillSettingsRow & { delivery_mode?: string | null },
    isDelivery ? cart.deliveryArea.trim() || null : null,
    (areasRes.data ?? []) as DeliveryAreaRow[],
    true,
  );
  // A bill that cannot be worked out (e.g. the discount limit was lowered) leaves the total unknown, not the cart lost.
  let total: number | null = null;
  if (delivery.ok) {
    const billed = computeBill(all.subtotalPence, cart.orderType, delivery.settings, discount);
    if (billed.ok) total = pounds(billed.bill.totalPence);
  }
  return { quote: total === null ? null : { unit_prices: unitPrices, total }, keptIndexes, unitPrices, removed };
}

export async function POST(request: Request) {
  const auth = await requireCapability(request, "hold_order");
  if (!auth.ok) return auth.response;
  const rid = auth.staff.restaurantId;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(`invalid body: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400);
  }
  const body = parsed.data;

  if (body.action === "list") {
    const { data, error } = await supabaseAdmin
      .from("held_carts")
      .select("id, label, created_at, staff_id, cart")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: false })
      .limit(MAX_HELD);
    if (error) {
      console.error("held-carts: list failed", error);
      return fail("could not load the held orders", 500);
    }
    return NextResponse.json({
      success: true,
      held: (data ?? []).map((h) => {
        const rec = h.cart as HeldCartRecord;
        return {
          id: h.id,
          label: h.label,
          created_at: h.created_at,
          mine: h.staff_id === auth.staff.staffId,
          item_count: (rec.cart?.lines ?? []).reduce((n, l) => n + l.quantity, 0),
          order_type: rec.cart?.orderType ?? null,
          table_number: rec.cart?.table?.tableNumber ?? null,
        };
      }),
    });
  }

  if (body.action === "hold") {
    const count = await supabaseAdmin.from("held_carts").select("id", { count: "exact", head: true }).eq("restaurant_id", rid);
    if ((count.count ?? 0) >= MAX_HELD) return fail("too many held orders; resume or delete some first", 409);

    // A table session in the cart must be one of this restaurant's, or it is not remembered.
    let cart = body.cart;
    let sessionId: string | null = null;
    if (cart.table) {
      const s = await supabaseAdmin.from("table_sessions").select("id").eq("id", cart.table.sessionId).eq("restaurant_id", rid).maybeSingle();
      if (s.data) sessionId = s.data.id;
      else cart = { ...cart, table: null };
    }
    const priced = await repriceCart(rid, cart);
    if ("error" in priced) return fail(priced.error, 500);
    if (priced.removed.length > 0) return fail(`cannot hold: ${priced.removed[0].name} is not available (${priced.removed[0].reason})`, 400);

    const record: HeldCartRecord = { version: 1, cart, quote: priced.quote };
    const { data, error } = await supabaseAdmin
      .from("held_carts")
      .insert({ restaurant_id: rid, staff_id: auth.staff.staffId, label: body.label, table_session_id: sessionId, cart: record })
      .select("id, label")
      .single();
    if (error || !data) {
      console.error("held-carts: insert failed", error);
      return fail("could not hold the order", 500);
    }
    return NextResponse.json({ success: true, id: data.id, label: data.label }, { status: 201 });
  }

  if (body.action === "delete") {
    const { data, error } = await supabaseAdmin.from("held_carts").delete().eq("id", body.id).eq("restaurant_id", rid).select("id");
    if (error) {
      console.error("held-carts: delete failed", error);
      return fail("could not delete the held order", 500);
    }
    return data && data.length > 0 ? NextResponse.json({ success: true }) : fail("held order not found", 404);
  }

  // resume: read the cart and remove it in one statement.
  const { data, error } = await supabaseAdmin.from("held_carts").delete().eq("id", body.id).eq("restaurant_id", rid).select("id, label, cart");
  if (error) {
    console.error("held-carts: resume failed", error);
    return fail("could not resume the held order", 500);
  }
  if (!data || data.length === 0) return fail("held order not found (it may already be resumed)", 404);
  const record = data[0].cart as HeldCartRecord;
  const stored = heldCartSchema.safeParse(record.cart);
  if (!stored.success) return fail("the held order is damaged", 500);
  let cart = stored.data;

  // The table may have been cleared while the cart was held.
  const notes: string[] = [];
  if (cart.table) {
    const s = await supabaseAdmin.from("table_sessions").select("id, cleared_at").eq("id", cart.table.sessionId).eq("restaurant_id", rid).maybeSingle();
    if (!s.data || s.data.cleared_at) {
      notes.push(`Table ${cart.table.tableNumber} is no longer seated. Choose the table again.`);
      cart = { ...cart, table: null };
    }
  }

  const priced = await repriceCart(rid, cart);
  if ("error" in priced) {
    // Put the cart back: nothing is lost if the prices could not be checked.
    await supabaseAdmin.from("held_carts").insert({
      id: data[0].id, restaurant_id: rid, staff_id: auth.staff.staffId, label: data[0].label, table_session_id: null, cart: record,
    });
    return fail("could not check the prices; the order is still held", 500);
  }
  const removedIndexes = new Set(cart.lines.map((_, i) => i).filter((i) => !priced.keptIndexes.includes(i)));
  const keptLines = cart.lines.filter((_, i) => !removedIndexes.has(i));
  if (keptLines.length === 0) return fail("none of the items on this held order are available any more", 409);
  const diff = compareQuotes(cart, record.quote, priced.keptIndexes, priced.unitPrices, priced.quote?.total ?? null);

  return NextResponse.json({
    success: true,
    label: data[0].label,
    cart: { ...cart, lines: keptLines },
    removed: priced.removed,
    price_changes: diff.changes,
    old_total: diff.oldTotal,
    new_total: diff.newTotal,
    total_changed: diff.totalChanged,
    notes,
  });
}
