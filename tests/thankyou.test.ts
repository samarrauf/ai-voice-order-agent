import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as settingsRoute } from "@/app/api/staff/settings/route";
import { POST as thankyouRoute } from "@/app/api/staff/thankyou/route";
import { POST as orderRoute } from "@/app/api/staff/manual-order/route";
import { POST as cancelRoute } from "@/app/api/staff/cancel-order/route";
import { POST as lookupOrder } from "@/app/api/tools/lookup-order/route";
import { POST as restaurantStatus } from "@/app/api/tools/restaurant-status/route";
import { POST as searchMenu } from "@/app/api/tools/search-menu/route";
import { loadBoardOrders } from "@/lib/orders-board";
import { DEFAULT_THANKYOU_TEMPLATE } from "@/lib/whatsapp-link";
import { RUN_MARKER, callTool, cleanupTestOrders, db, staffCookie } from "./helpers/helpers";

// B4d: WhatsApp thank-you + Google review button. Only throwaway "vitest-run-"
// restaurants (A and B). Needs migration 0031 (restaurant_messages + the
// 'messages' section of update_restaurant_settings_tx).

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON test responses are untyped, as in the other tests */
let A: string;
let B: string;
let ownerA: string;
let managerA: string;
let staffA: string;
let ownerB: string;
let dishId: string;

const REVIEW = "https://g.page/r/vitest-review/review";
const PHONE = "0300 1234567";
const PHONE_DIGITS = "923001234567";

type Route = (r: Request) => Promise<Response>;
async function call(route: Route, body: unknown, cookie: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await route(new Request("http://localhost/api/staff/x", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}
const messagesRow = async (rid: string) =>
  (await db.from("restaurant_messages").select("*").eq("restaurant_id", rid).maybeSingle()).data as Record<string, any> | null;
const audit = async (rid: string) =>
  ((await db.from("settings_audit").select("*").eq("restaurant_id", rid).eq("section", "messages").order("created_at")).data ?? []) as any[];
const saveMessages = (values: Record<string, unknown>, cookie: string | null) => call(settingsRoute, { section: "messages", values }, cookie);

async function newOrder(customer_name: string | null = "Ali") {
  const o = await call(
    orderRoute,
    { order_type: "takeaway", notes: RUN_MARKER, customer_name, items: [{ menu_item_id: dishId, quantity: 1 }] },
    staffA,
  );
  expect(o.status).toBe(201);
  return { id: o.json.order_id as string, number: o.json.order_number as string };
}

beforeAll(async () => {
  const r = await db
    .from("restaurants")
    .insert([{ name: `${RUN_MARKER}-ty-A`, currency: "PKR" }, { name: `${RUN_MARKER}-ty-B`, currency: "GBP" }])
    .select("id, name");
  if (r.error) throw r.error;
  A = r.data.find((x) => x.name.endsWith("-A"))!.id;
  B = r.data.find((x) => x.name.endsWith("-B"))!.id;
  const m = await db.from("menu_items").insert({ restaurant_id: A, name: "Vitest Karahi", base_price: 1200 }).select("id").single();
  if (m.error) throw m.error;
  dishId = m.data.id;
  ownerA = await staffCookie(A, "owner");
  managerA = await staffCookie(A, "manager");
  staffA = await staffCookie(A, "staff");
  ownerB = await staffCookie(B, "owner");
});

afterAll(async () => {
  await cleanupTestOrders();
  for (const rid of [A, B]) if (rid) await db.from("restaurants").delete().eq("id", rid); // messages, events, audit go with them
});

describe("Settings: review link and thank-you template", () => {
  it("manager and staff cannot edit them (403), no login 401; nothing saved", async () => {
    const values = { google_review_url: REVIEW, thankyou_template: null };
    expect((await saveMessages(values, null)).status).toBe(401);
    expect((await saveMessages(values, staffA)).status).toBe(403);
    expect((await saveMessages(values, managerA)).status).toBe(403);
    expect(await messagesRow(A)).toBeNull();
    expect(await audit(A)).toHaveLength(0);
  });

  it.each([
    ["http (not https)", "http://g.page/r/x/review"],
    ["another host", "https://evil.example.com/review"],
    ["look-alike host", "https://g.page.evil.com/r/x"],
    ["javascript:", "javascript:alert(1)"],
  ])("refuses a review link that is %s", async (_label, url) => {
    const r = await saveMessages({ google_review_url: url, thankyou_template: null }, ownerA);
    expect(r.status).toBe(400);
    expect(await messagesRow(A)).toBeNull();
  });

  it("refuses a template over 600 characters, or unknown fields", async () => {
    expect((await saveMessages({ google_review_url: null, thankyou_template: "x".repeat(601) }, ownerA)).status).toBe(400);
    expect((await saveMessages({ google_review_url: null, thankyou_template: null, restaurant_id: B }, ownerA)).status).toBe(400);
    expect(await messagesRow(A)).toBeNull();
  });

  it("owner saves both, with one audit row; saving the same again writes nothing", async () => {
    const tpl = "Shukriya {customer_name}! {restaurant} order {order_no} total {total}\nRate: {review_link}";
    const r = await saveMessages({ google_review_url: REVIEW, thankyou_template: tpl }, ownerA);
    expect(r.status).toBe(200);
    expect(r.json.changed).toEqual(expect.arrayContaining(["google_review_url", "thankyou_template"]));
    const row = await messagesRow(A);
    expect(row?.google_review_url).toBe(REVIEW);
    expect(row?.thankyou_template).toBe(tpl);
    const a = await audit(A);
    expect(a).toHaveLength(1);
    expect(a[0].changes.google_review_url).toEqual({ from: null, to: REVIEW });

    const again = await saveMessages({ google_review_url: REVIEW, thankyou_template: tpl }, ownerA);
    expect(again.json.changed).toEqual([]);
    expect(await audit(A)).toHaveLength(1);
  });

  it("tenant isolation: A's save never touches B, and the database refuses A's owner on B", async () => {
    expect(await messagesRow(B)).toBeNull();
    const ownerAId = (await db.from("staff_accounts").select("id").eq("restaurant_id", A).eq("role", "owner").limit(1).single()).data!.id;
    const { data } = await db.rpc("update_restaurant_settings_tx", {
      p_restaurant_id: B,
      p_staff_id: ownerAId,
      p_section: "messages",
      p_values: { google_review_url: REVIEW },
    });
    expect(data).toEqual({ ok: false, error: "not_allowed" });
    expect(await messagesRow(B)).toBeNull();
    expect(await audit(B)).toHaveLength(0);

    // B's own owner saves B only.
    expect((await saveMessages({ google_review_url: null, thankyou_template: "B says thanks" }, ownerB)).status).toBe(200);
    expect((await messagesRow(B))?.thankyou_template).toBe("B says thanks");
    expect((await messagesRow(A))?.google_review_url).toBe(REVIEW);
  });

  it("the browser's anon key cannot read restaurant_messages or run the settings function", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const read = await anon.from("restaurant_messages").select("*").eq("restaurant_id", A);
    expect(read.data ?? []).toHaveLength(0);
    const rpc = await anon.rpc("update_restaurant_settings_tx", {
      p_restaurant_id: A, p_staff_id: A, p_section: "messages", p_values: {},
    });
    expect(rpc.error?.code).toBe("42501");
  });
});

describe("the thank-you button (/api/staff/thankyou)", () => {
  it("needs a login; another restaurant's order is 404; a different body restaurant_id is 403", async () => {
    const o = await newOrder();
    expect((await call(thankyouRoute, { action: "message", order_id: o.id }, null)).status).toBe(401);
    expect((await call(thankyouRoute, { action: "message", order_id: o.id }, ownerB)).status).toBe(404);
    expect((await call(thankyouRoute, { action: "message", order_id: o.id, restaurant_id: B }, staffA)).status).toBe(403);
  });

  it("staff get the message built from the database, and can save a phone (normalised)", async () => {
    const o = await newOrder("Ali");
    const m = await call(thankyouRoute, { action: "message", order_id: o.id }, staffA);
    expect(m.status).toBe(200);
    expect(m.json.customer_phone).toBeNull();
    expect(m.json.url).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(m.json.text).toContain(`Shukriya Ali! ${RUN_MARKER}-ty-A order ${o.number}`);
    expect(m.json.text).toContain(REVIEW);
    expect(m.json.has_review_link).toBe(true);

    expect((await call(thankyouRoute, { action: "set_phone", order_id: o.id, customer_phone: "12345" }, staffA)).status).toBe(400);
    const s = await call(thankyouRoute, { action: "set_phone", order_id: o.id, customer_phone: PHONE }, staffA);
    expect(s.status).toBe(200);
    expect(s.json.customer_phone).toBe(`+${PHONE_DIGITS}`);
    expect(s.json.url).toMatch(new RegExp(`^https://wa\\.me/${PHONE_DIGITS}\\?text=`));
    expect((await db.from("orders").select("customer_phone").eq("id", o.id).single()).data!.customer_phone).toBe(`+${PHONE_DIGITS}`);
  });

  it("a click is noted in order_events by the staff member who pressed it", async () => {
    const o = await newOrder();
    const c = await call(thankyouRoute, { action: "clicked", order_id: o.id }, staffA);
    expect(c.status).toBe(200);
    const ev = (await db.from("order_events").select("*").eq("order_id", o.id).eq("event", "thankyou_clicked")).data ?? [];
    expect(ev).toHaveLength(1);
    expect(ev[0].restaurant_id).toBe(A);
    expect(ev[0].staff_id).toBeTruthy();

    const board = await loadBoardOrders(A, "staff");
    const row = board.find((b) => b.id === o.id)!;
    expect(row.thankyou?.clicked).toBe(true);
  });

  it("no review link: still works, without the review line; owner's reset to default works too", async () => {
    expect((await saveMessages({ google_review_url: null, thankyou_template: null }, ownerA)).status).toBe(200);
    const o = await newOrder("Sara");
    const m = await call(thankyouRoute, { action: "message", order_id: o.id }, staffA);
    expect(m.status).toBe(200);
    expect(m.json.has_review_link).toBe(false);
    expect(m.json.text).not.toContain("stars");
    expect(m.json.text).toContain("Sara");
    expect(m.json.text).toContain(o.number);
    expect(m.json.text.split("\n")).toHaveLength(DEFAULT_THANKYOU_TEMPLATE.split("\n").length - 1);
  });

  it("a cancelled order has no button: the board leaves it out and the API says 409", async () => {
    const o = await newOrder();
    expect((await call(cancelRoute, { order_id: o.id, reason: "Duplicate order" }, staffA)).status).toBe(200);
    for (const action of ["message", "clicked"]) {
      expect((await call(thankyouRoute, { action, order_id: o.id }, staffA)).status).toBe(409);
    }
    expect((await call(thankyouRoute, { action: "set_phone", order_id: o.id, customer_phone: PHONE }, staffA)).status).toBe(409);
    const board = await loadBoardOrders(A, "owner");
    expect(board.find((b) => b.id === o.id)!.thankyou).toBeUndefined();
  });
});

describe("the customer's phone and the review link stay with logged-in staff", () => {
  it("never appear in the voice agent's tool answers", async () => {
    expect((await saveMessages({ google_review_url: REVIEW, thankyou_template: null }, ownerA)).status).toBe(200);
    const o = await newOrder();
    expect((await call(thankyouRoute, { action: "set_phone", order_id: o.id, customer_phone: PHONE }, staffA)).status).toBe(200);

    const answers = [
      await callTool(lookupOrder, { restaurant_id: A, order_number: o.number, customer_phone: PHONE }),
      await callTool(lookupOrder, { restaurant_id: A, order_number: o.number, customer_phone: `+${PHONE_DIGITS}` }),
      await callTool(restaurantStatus, { restaurant_id: A }),
      await callTool(searchMenu, { restaurant_id: A, query: "karahi" }),
    ];
    for (const a of answers) {
      const text = JSON.stringify(a.json);
      expect(text).not.toContain(PHONE_DIGITS);
      expect(text).not.toContain("3001234567");
      expect(text).not.toContain("vitest-review");
      expect(text).not.toContain("wa.me");
    }
  });

  it("the public restaurants table has no such columns (anon key)", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const r = await anon.from("restaurants").select("*").eq("id", A);
    for (const row of r.data ?? []) {
      expect(JSON.stringify(row)).not.toContain("vitest-review");
      expect(row).not.toHaveProperty("google_review_url");
      expect(row).not.toHaveProperty("thankyou_template");
    }
    const orders = await anon.from("orders").select("customer_phone").eq("restaurant_id", A);
    expect(orders.data ?? []).toHaveLength(0);
  });

  it("roles: a staff login may press the button but may not edit Settings", async () => {
    const o = await newOrder();
    expect((await call(thankyouRoute, { action: "message", order_id: o.id }, staffA)).status).toBe(200);
    expect((await call(thankyouRoute, { action: "clicked", order_id: o.id }, managerA)).status).toBe(200);
    expect((await saveMessages({ google_review_url: REVIEW, thankyou_template: null }, staffA)).status).toBe(403);
    expect((await saveMessages({ google_review_url: REVIEW, thankyou_template: null }, managerA)).status).toBe(403);
  });
});
