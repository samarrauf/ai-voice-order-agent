import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { RID, db } from "./helpers/helpers";

// Needs migration 0008 applied in Supabase. If it isn't yet, the first test fails loudly.
const MARK = "vitest-pos-foundations";
let tableId: string;
const createdSessions: string[] = [];

const orderRow = (extra: Record<string, unknown> = {}) => ({
  restaurant_id: RID,
  fulfilment_type: "pickup",
  customer_name: "Vitest Source",
  customer_phone: "+447700900123",
  subtotal: 1,
  delivery_fee: 0,
  total: 1,
  payment_method: "cash",
  notes: MARK,
  ...extra,
});

beforeAll(async () => {
  const { data } = await db.from("restaurant_tables").select("id").eq("restaurant_id", RID).limit(1).single();
  tableId = data!.id;
});

afterAll(async () => {
  await db.from("orders").delete().eq("notes", MARK);
  if (createdSessions.length) await db.from("table_sessions").delete().in("id", createdSessions);
});

describe("orders.source", () => {
  it("migration 0008 is applied (orders.source exists)", async () => {
    const { error } = await db.from("orders").select("source, table_session_id").limit(1);
    expect(error, "run supabase/migrations/0008_pos_foundations.sql in the SQL Editor").toBeNull();
  });

  it("defaults to 'phone'", async () => {
    const { data, error } = await db.from("orders").insert(orderRow()).select("source").single();
    expect(error).toBeNull();
    expect(data!.source).toBe("phone");
  });

  it.each(["table_booking", "walk_in"])("accepts '%s'", async (source) => {
    const { error } = await db.from("orders").insert(orderRow({ source }));
    expect(error).toBeNull();
  });

  it("rejects an invalid source", async () => {
    const { error } = await db.from("orders").insert(orderRow({ source: "carrier_pigeon" }));
    expect(error).not.toBeNull();
  });
});

describe("table_sessions", () => {
  const session = (extra: Record<string, unknown> = {}) => ({
    restaurant_id: RID, table_id: tableId, party_size: 2, source: "walk_in", ...extra,
  });

  it.each(["walk_in", "booking"])("accepts source '%s'", async (source) => {
    const { data, error } = await db
      .from("table_sessions")
      .insert(session({ source }))
      .select("id, seated_at, cleared_at")
      .single();
    expect(error).toBeNull();
    expect(data!.seated_at).toBeTruthy();
    expect(data!.cleared_at).toBeNull();
    createdSessions.push(data!.id);
  });

  it("rejects an invalid source", async () => {
    const { error } = await db.from("table_sessions").insert(session({ source: "phone" }));
    expect(error).not.toBeNull();
  });

  it("rejects a party size of 0", async () => {
    const { error } = await db.from("table_sessions").insert(session({ party_size: 0 }));
    expect(error).not.toBeNull();
  });

  it("is invisible to the anon key (RLS, no policies)", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data } = await anon.from("table_sessions").select("id");
    expect(data ?? []).toEqual([]);
  });
});
