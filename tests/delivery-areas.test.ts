import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as checkDelivery } from "@/app/api/tools/check-delivery/route";
import { POST as createOrder } from "@/app/api/tools/create-order/route";
import { POST as manualOrder } from "@/app/api/staff/manual-order/route";
import { POST as pricePreview } from "@/app/api/staff/price-preview/route";
import { POST as restaurantStatus } from "@/app/api/tools/restaurant-status/route";
import {
  AREA_MISSING_SPEECH,
  AREA_NOT_LISTED_SPEECH,
  NO_DELIVERY_SPEECH,
  OUTSIDE_POSTCODE_SPEECH,
  addressWithArea,
  areaKey,
  decideDelivery,
  deliveryModeOf,
  findDeliveryArea,
  inDeliveryArea,
} from "@/lib/delivery";
import { currencyFields, moneyForSpeech, priceForSpeech } from "@/lib/speech";
import { SESSION_COOKIE } from "@/lib/session";
import { RID, RUN_MARKER, callTool, cleanupTestOrders, db, orderBody, sessionToken, useOpenClock, useRealClock } from "./helpers/helpers";

// P9a-B: delivery by area list (and 'none'), on THROWAWAY restaurants only
// ("vitest-run-..." names, removed afterwards and by the self-heal in
// tests/helpers/global-setup.ts). Napoli is only READ (its opening hours are
// copied, and check-delivery is asked a question); Olive 'n Spice is never touched.

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */

// ---------------------------------------------------------------- pure rules

describe("delivery rules (lib/delivery.ts)", () => {
  const areas = [
    { label: "Satellite Town", fee_override: 100, is_active: true },
    { label: "Model Town", fee_override: null, is_active: true },
    { label: "Old City", fee_override: 50, is_active: false },
  ];

  it("area names match ignoring case, spaces and dashes", () => {
    expect(areaKey("  Satellite-Town ")).toBe("satellitetown");
    for (const said of ["satellite town", "SATELLITE-TOWN", "Satellite  Town", "satellitetown", "Satellite – Town"]) {
      expect(findDeliveryArea(said, areas)?.label, said).toBe("Satellite Town");
    }
    expect(findDeliveryArea("Satellite", areas)).toBeNull();
    expect(findDeliveryArea("", areas)).toBeNull();
  });

  it("an inactive area never matches", () => {
    expect(findDeliveryArea("Old City", areas)).toBeNull();
    expect(decideDelivery("area_list", { area: "Old City" }, areas, 200)).toEqual({ ok: false, reason: "area_not_listed" });
  });

  it("area_list: fee_override wins, else the restaurant's fee", () => {
    expect(decideDelivery("area_list", { area: "satellite town" }, areas, 200)).toMatchObject({ ok: true, fee: 100 });
    expect(decideDelivery("area_list", { area: "Model Town" }, areas, 200)).toMatchObject({ ok: true, fee: 200 });
    expect(decideDelivery("area_list", { area: "" }, areas, 200)).toEqual({ ok: false, reason: "area_missing" });
    expect(decideDelivery("area_list", { area: "Gulberg" }, areas, 200)).toEqual({ ok: false, reason: "area_not_listed" });
    // No active areas at all = no delivery.
    expect(decideDelivery("area_list", { area: "Old City" }, [areas[2]], 200)).toEqual({ ok: false, reason: "no_delivery" });
  });

  it("'none' never delivers; 'postcode' is exactly the old postcode check", () => {
    expect(decideDelivery("none", { area: "Satellite Town", postcode: "M14 5TP" }, areas, 2.5)).toEqual({ ok: false, reason: "no_delivery" });
    for (const pc of ["M14 5TP", "m1 1aa", "M23", "M24 1AA", "SW1A 1AA", "banana"]) {
      const d = decideDelivery("postcode", { postcode: pc }, areas, 2.5);
      expect(d.ok, pc).toBe(inDeliveryArea(pc));
      if (d.ok) expect(d.fee).toBe(2.5); // areas are ignored in postcode mode
    }
  });

  it("an unknown mode fails closed; a missing one is 'postcode'", () => {
    expect(deliveryModeOf(undefined)).toBe("postcode");
    expect(deliveryModeOf(null)).toBe("postcode");
    expect(deliveryModeOf("area_list")).toBe("area_list");
    expect(deliveryModeOf("something")).toBe("none");
  });

  it("the area is added to the address once", () => {
    const a = areas[0];
    expect(addressWithArea("12 Main Road", a)).toBe("12 Main Road, Satellite Town");
    expect(addressWithArea("12 Main Road, satellite-town", a)).toBe("12 Main Road, satellite-town");
    expect(addressWithArea("12 Main Road", null)).toBe("12 Main Road");
  });

  it("money for speech: GBP unchanged, other currencies say their word, never a symbol", () => {
    expect(moneyForSpeech(8.5, "GBP")).toBe(priceForSpeech(8.5));
    expect(moneyForSpeech(8.5, null)).toBe("8.50");
    expect(moneyForSpeech(150, "PKR")).toBe("150 rupees");
    expect(moneyForSpeech(1250.5, "PKR")).toBe("1250.50 rupees");
    expect(moneyForSpeech(8.5, "EUR")).toBe("8.50 euros");
    expect(currencyFields("PKR")).toEqual({ currency: "PKR", currency_word: "rupees" });
    expect(currencyFields(undefined)).toEqual({ currency: "GBP", currency_word: "pounds" });
  });
});

// ---------------------------------------------------------------- end to end

let areaRid: string; // area_list, PKR, fee 200: Satellite Town (100), Model Town (no override), Old City (inactive)
let otherRid: string; // area_list: Faisal Colony only (tenant isolation)
let emptyRid: string; // area_list with no areas = no delivery
let noneRid: string; // delivery_mode 'none'
let karahiId: string; // on areaRid, 1250
let noneItemId: string; // on noneRid, 500

async function staff(handler: (r: Request) => Promise<Response>, rid: string, body: Record<string, unknown>) {
  const res = await handler(
    new Request("http://localhost/api/staff/x", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${await sessionToken(rid)}` },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

const check = (rid: string, where: Record<string, unknown>) => callTool(checkDelivery, { restaurant_id: rid, ...where });

const karahi = () => [{ menu_item_id: karahiId, size_name: null, quantity: 2, options: [], notes: null }];

const agentDelivery = (overrides: Record<string, unknown> = {}) =>
  orderBody({
    restaurant_id: areaRid,
    delivery_address: "12 Main Road",
    delivery_postcode: null,
    delivery_area: "Satellite Town",
    items: karahi(),
    ...overrides,
  });

const posDelivery = (overrides: Record<string, unknown> = {}) => ({
  order_type: "delivery",
  customer_name: "Vitest Customer",
  customer_phone: "07700900123",
  delivery_address: "12 Main Road",
  delivery_area: "Satellite Town",
  notes: RUN_MARKER,
  items: karahi(),
  ...overrides,
});

async function makeRestaurant(suffix: string, patch: Record<string, unknown>) {
  const napoli = await db.from("restaurants").select("opening_hours, timezone").eq("id", RID).single();
  if (napoli.error) throw napoli.error;
  const r = await db
    .from("restaurants")
    .insert({
      name: `${RUN_MARKER}-${suffix}`,
      opening_hours: napoli.data.opening_hours,
      timezone: napoli.data.timezone,
      tax_rate_percent: 0,
      service_charge_percent: 0,
      service_charge_applies_to: "none",
      max_discount_percent: 0,
      min_order_value: null,
      ...patch,
    })
    .select("id")
    .single();
  if (r.error) throw r.error;
  return r.data.id as string;
}

beforeAll(async () => {
  areaRid = await makeRestaurant("areas", { delivery_mode: "area_list", currency: "PKR", delivery_fee: 200 });
  otherRid = await makeRestaurant("areas-other", { delivery_mode: "area_list", currency: "PKR", delivery_fee: 300 });
  emptyRid = await makeRestaurant("areas-empty", { delivery_mode: "area_list", currency: "PKR", delivery_fee: 200 });
  noneRid = await makeRestaurant("none", { delivery_mode: "none", currency: "PKR", delivery_fee: 200 });

  // Every row lists every column: a batch insert sends null for a missing one.
  const a = await db.from("delivery_areas").insert([
    { restaurant_id: areaRid, label: "Satellite Town", fee_override: 100, is_active: true },
    { restaurant_id: areaRid, label: "Model Town", fee_override: null, is_active: true },
    { restaurant_id: areaRid, label: "Old City", fee_override: 50, is_active: false },
    { restaurant_id: otherRid, label: "Faisal Colony", fee_override: 75, is_active: true },
  ]);
  if (a.error) throw a.error;

  const m = await db
    .from("menu_items")
    .insert([
      { restaurant_id: areaRid, name: "Vitest Karahi", base_price: 1250 },
      { restaurant_id: noneRid, name: "Vitest Naan", base_price: 500 },
    ])
    .select("id, restaurant_id");
  if (m.error) throw m.error;
  karahiId = m.data.find((x) => x.restaurant_id === areaRid)!.id;
  noneItemId = m.data.find((x) => x.restaurant_id === noneRid)!.id;
});

// The agent refuses orders when the restaurant is closed: pin the clock to an open time.
beforeEach(useOpenClock);
afterEach(useRealClock);

afterAll(async () => {
  await cleanupTestOrders();
  for (const id of [areaRid, otherRid, emptyRid, noneRid]) {
    if (id) await db.from("restaurants").delete().eq("id", id); // areas, menu and staff rows go with it
  }
});

describe("the database", () => {
  it("delivery_areas names are unique per restaurant, ignoring case", async () => {
    const dup = await db.from("delivery_areas").insert({ restaurant_id: areaRid, label: "SATELLITE TOWN" });
    expect(dup.error?.code).toBe("23505");
    // The same name at another restaurant is fine (and is cleaned up with it).
    const ok = await db.from("delivery_areas").insert({ restaurant_id: otherRid, label: "Satellite Town", is_active: false });
    expect(ok.error).toBeNull();
  });

  it("delivery_mode only allows postcode, area_list or none", async () => {
    const bad = await db.from("restaurants").update({ delivery_mode: "radius" }).eq("id", noneRid);
    expect(bad.error?.code).toBe("23514");
  });
});

describe("check-delivery, area_list", () => {
  it("a listed area is accepted, with its fee_override and the currency word", async () => {
    const r = await check(areaRid, { area: "satellite-town" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ deliverable: true, fee: 100, area: "Satellite Town", delivery_mode: "area_list", currency: "PKR", currency_word: "rupees" });
    expect(r.json.speech).toBe("Yes, we deliver to Satellite Town. It's 100 rupees for delivery, about 45 minutes.");
    expect(r.json.speech).not.toMatch(/£|Rs|PKR/);
  });

  it("an area without fee_override uses the restaurant's delivery_fee", async () => {
    const r = await check(areaRid, { area: "Model Town" });
    expect(r.json).toMatchObject({ deliverable: true, fee: 200 });
  });

  it("an area the agent put in the postcode field still works", async () => {
    const r = await check(areaRid, { postcode: "Model Town" });
    expect(r.json).toMatchObject({ deliverable: true, area: "Model Town" });
  });

  it("an unlisted area is refused clearly, offering collection", async () => {
    const r = await check(areaRid, { area: "Gulberg" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ deliverable: false, reason: "area_not_listed", currency_word: "rupees" });
    expect(r.json.speech).toBe(AREA_NOT_LISTED_SPEECH);
    expect(r.json.fee).toBeUndefined();
  });

  it("an inactive area is refused", async () => {
    const r = await check(areaRid, { area: "Old City" });
    expect(r.json).toMatchObject({ deliverable: false, reason: "area_not_listed" });
  });

  it("no area given: the agent is told to ask for it", async () => {
    const r = await check(areaRid, {});
    expect(r.json).toMatchObject({ deliverable: false, reason: "area_missing" });
    expect(r.json.speech).toBe(AREA_MISSING_SPEECH);
  });

  it("tenant isolation: another restaurant's areas are never used", async () => {
    expect((await check(areaRid, { area: "Faisal Colony" })).json.deliverable).toBe(false);
    expect((await check(otherRid, { area: "Satellite Town" })).json.deliverable).toBe(false); // inactive copy there
    expect((await check(otherRid, { area: "Faisal Colony" })).json).toMatchObject({ deliverable: true, fee: 75 });
  });

  it("an area_list restaurant with no areas does not deliver", async () => {
    const r = await check(emptyRid, { area: "Satellite Town" });
    expect(r.json).toMatchObject({ deliverable: false, reason: "no_delivery" });
    expect(r.json.speech).toBe(NO_DELIVERY_SPEECH);
  });
});

describe("delivery_mode 'none'", () => {
  it("check-delivery refuses, whatever is said", async () => {
    for (const where of [{ area: "Satellite Town" }, { postcode: "M14 5TP" }]) {
      const r = await check(noneRid, where);
      expect(r.json).toMatchObject({ deliverable: false, reason: "no_delivery" });
      expect(r.json.speech).toBe(NO_DELIVERY_SPEECH);
    }
  });

  it("the agent's create-order refuses a delivery but takes a collection", async () => {
    const items = [{ menu_item_id: noneItemId, size_name: null, quantity: 1, options: [], notes: null }];
    const del = await callTool(createOrder, orderBody({ restaurant_id: noneRid, items, preview: true }));
    expect(del.status).toBe(400);
    expect(del.json.speech).toBe(NO_DELIVERY_SPEECH);
    const pickup = await callTool(
      createOrder,
      orderBody({ restaurant_id: noneRid, items, preview: true, fulfilment_type: "pickup", delivery_address: null, delivery_postcode: null }),
    );
    expect(pickup.status, JSON.stringify(pickup.json)).toBe(200);
    expect(pickup.json.total).toBe(500);
    expect(pickup.json.speech).toContain("500 rupees in total");
  });

  it("the POS refuses a delivery", async () => {
    const items = [{ menu_item_id: noneItemId, size_name: null, quantity: 1, options: [], notes: null }];
    const r = await staff(manualOrder, noneRid, { ...posDelivery(), items });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/does not deliver/);
  });
});

describe("create-order (agent), area_list", () => {
  it("preview: the area's fee, the area in the read-back, amounts with 'rupees'", async () => {
    const r = await callTool(createOrder, { ...agentDelivery(), preview: true });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toMatchObject({ subtotal: 2500, delivery_fee: 100, total: 2600, currency: "PKR", currency_word: "rupees", delivery_area: "Satellite Town" });
    expect(r.json.speech).toContain("for delivery to Satellite Town");
    expect(r.json.speech).toContain("2600 rupees in total, including 100 rupees delivery");
    expect(r.json.speech).not.toMatch(/£|Rs\b|PKR/);
  });

  it("refuses an unlisted area, an inactive area, another restaurant's area and a missing area", async () => {
    for (const area of ["Gulberg", "Old City", "Faisal Colony"]) {
      const r = await callTool(createOrder, { ...agentDelivery({ delivery_area: area }), preview: true });
      expect(r.status, area).toBe(400);
      expect(r.json.speech, area).toBe(AREA_NOT_LISTED_SPEECH);
    }
    const missing = await callTool(createOrder, { ...agentDelivery({ delivery_area: null }), preview: true });
    expect(missing.status).toBe(400);
    expect(missing.json.speech).toBe(AREA_MISSING_SPEECH);
  });

  it("an area_list restaurant with no areas refuses delivery", async () => {
    const r = await callTool(createOrder, { ...agentDelivery({ restaurant_id: emptyRid }), preview: true });
    expect(r.status).toBe(400);
    expect(r.json.speech).toBe(NO_DELIVERY_SPEECH);
  });
});

describe("price-preview (POS), area_list", () => {
  it("prices the chosen area's fee; with no area chosen yet, the restaurant's fee", async () => {
    const withArea = await staff(pricePreview, areaRid, { order_type: "delivery", delivery_area: "Satellite Town", items: karahi() });
    expect(withArea.status, JSON.stringify(withArea.json)).toBe(200);
    expect(withArea.json).toMatchObject({ delivery_fee: 100, total: 2600 });
    const noArea = await staff(pricePreview, areaRid, { order_type: "delivery", items: karahi() });
    expect(noArea.json).toMatchObject({ delivery_fee: 200, total: 2700 });
  });
});

describe("manual-order (POS), area_list", () => {
  it("refuses a missing, unlisted, inactive or other restaurant's area, and saves nothing", async () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ delivery_area: null }, /delivery_area is required/],
      [{ delivery_area: "Gulberg" }, /do not deliver to that area/],
      [{ delivery_area: "Old City" }, /do not deliver to that area/],
      [{ delivery_area: "Faisal Colony" }, /do not deliver to that area/],
    ];
    for (const [patch, error] of cases) {
      const r = await staff(manualOrder, areaRid, posDelivery(patch));
      expect(r.status, JSON.stringify(patch)).toBe(400);
      expect(r.json.error).toMatch(error);
    }
    const saved = await db.from("orders").select("id").eq("restaurant_id", areaRid);
    expect(saved.data).toEqual([]);
  });
});

describe("POS and agent: the same delivery fee and total for an area", () => {
  for (const area of ["Satellite Town", "Model Town"]) {
    it(`${area}: agent order, agent preview, POS preview and POS order all agree`, async () => {
      const preview = await callTool(createOrder, { ...agentDelivery({ delivery_area: area }), preview: true });
      const agent = await callTool(createOrder, agentDelivery({ delivery_area: area }));
      const posPreview = await staff(pricePreview, areaRid, { order_type: "delivery", delivery_area: area, items: karahi() });
      const pos = await staff(manualOrder, areaRid, posDelivery({ delivery_area: area }));
      const quote = await check(areaRid, { area });
      expect(agent.status, JSON.stringify(agent.json)).toBe(200);
      expect(pos.status, JSON.stringify(pos.json)).toBe(201);

      const fee = area === "Satellite Town" ? 100 : 200;
      const keys = ["subtotal", "delivery_fee", "service_charge", "tax", "rounding", "total"] as const;
      const pick = (j: Record<string, any>) => Object.fromEntries(keys.map((k) => [k, j[k]]));
      const expected = { subtotal: 2500, delivery_fee: fee, service_charge: 0, tax: 0, rounding: 0, total: 2500 + fee };
      expect(pick(agent.json)).toEqual(expected);
      expect(pick(preview.json)).toEqual(expected);
      expect(pick(posPreview.json)).toEqual(expected);
      expect(pick(pos.json)).toEqual(expected);
      expect(quote.json.fee).toBe(fee); // what check_delivery told the caller

      // Saved rows: same money, the area kept in the address, no postcode.
      const rows = await db
        .from("orders")
        .select("order_number, delivery_fee, total, delivery_address, delivery_postcode")
        .eq("restaurant_id", areaRid)
        .in("order_number", [agent.json.order_number, pos.json.order_number]);
      expect(rows.error).toBeNull();
      expect(rows.data).toHaveLength(2);
      for (const row of rows.data!) {
        expect(Number(row.delivery_fee)).toBe(fee);
        expect(Number(row.total)).toBe(2500 + fee);
        expect(row.delivery_address).toBe(`12 Main Road, ${area}`);
        expect(row.delivery_postcode).toBeNull();
      }
      expect(agent.json.speech).toContain(`delivering to ${area}`);
      expect(pos.json.delivery_area).toBe(area);
    });
  }
});

describe("Napoli (postcode mode) is unchanged", () => {
  it("check-delivery: same answer and speech as before, plus the currency fields", async () => {
    const { data, error } = await db.from("restaurants").select("delivery_fee, delivery_mode, currency").eq("id", RID).single();
    if (error) throw error;
    expect(data.delivery_mode).toBe("postcode");

    const ok = await check(RID, { postcode: "M14 5TP" });
    expect(ok.status).toBe(200);
    const fee = Number(data.delivery_fee);
    expect(ok.json).toMatchObject({ deliverable: true, fee, eta_minutes: 45, delivery_mode: "postcode", currency: "GBP", currency_word: "pounds" });
    expect(ok.json.speech).toBe(
      fee > 0
        ? `Yes, we deliver there. It's ${fee.toFixed(2)} for delivery, about 45 minutes.`
        : "Yes, we deliver there. Delivery is free, about 45 minutes.",
    );
    expect(ok.json.speech).not.toMatch(/pounds|£/);

    const out = await check(RID, { postcode: "SW1A 1AA" });
    expect(out.json).toMatchObject({ deliverable: false });
    expect(out.json.speech).toBe(OUTSIDE_POSTCODE_SPEECH);
    // An area is ignored in postcode mode.
    expect((await check(RID, { area: "M14 5TP" })).status).toBe(400);
  });

  it("restaurant-status tells the agent Napoli's mode and currency", async () => {
    const r = await callTool(restaurantStatus, { restaurant_id: RID });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ delivery_mode: "postcode", currency: "GBP", currency_word: "pounds" });
  });
});
