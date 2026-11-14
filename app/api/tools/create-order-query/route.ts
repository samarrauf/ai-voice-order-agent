import { NextResponse } from "next/server";
import { z } from "zod";
import { requireToolSecret } from "@/lib/auth";
import { findOrderForCaller, ORDER_NOT_FOUND_SPEECH } from "@/lib/order-lookup";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/speech";
import { timed } from "@/lib/timing";

// Voice-agent tool: record a refund / change / complaint about a past order and
// give the caller a reference number. BUSINESS RULE: this never decides or
// changes anything (no refund, discount or order edit) — staff decide later.
//
// The agent's order id is never used: the order is re-found here from the
// order number + phone, exactly like lookup-order.

const MIN_DESCRIPTION = 5;
const SAVE_FAILED_SPEECH = "Sorry, I couldn't save that just now. Could you ring the shop back in a few minutes?";

const bodySchema = z.object({
  restaurant_id: z.guid(),
  order_number: z.string().trim().min(1).max(20),
  customer_phone: z.string().transform(normalizePhone),
  query_type: z.enum(["refund", "change", "complaint"]),
  description: z.string().trim().min(MIN_DESCRIPTION).max(1000),
});

export const POST = timed("create-order-query", async (request: Request, timer) => {
  const denied = requireToolSecret(request);
  timer.lap("auth");
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  timer.lap("parse");
  if (!parsed.success) {
    const paths = parsed.error.issues.map((i) => i.path.join("."));
    const speech = paths.includes("description")
      ? "Sorry, could you tell me a bit more about what happened so I can pass it on?"
      : "Sorry, could I have the order number and the phone number you ordered with?";
    return NextResponse.json(
      { success: false, error: `invalid body: ${paths.join(", ") || "missing"}`, speech },
      { status: 400 },
    );
  }

  const { restaurant_id, order_number, customer_phone, query_type, description } = parsed.data;

  let order;
  try {
    order = await findOrderForCaller(restaurant_id, order_number, customer_phone);
  } catch (e) {
    console.error("create-order-query: lookup failed", e);
    return NextResponse.json({ success: false, error: "lookup failed", speech: SAVE_FAILED_SPEECH }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ success: false, error: "not_found", speech: ORDER_NOT_FOUND_SPEECH }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("order_queries")
    .insert({ restaurant_id, order_id: order.id, query_type, description })
    .select("reference_number")
    .single();
  timer.lap("db");
  if (error || !data) {
    console.error("create-order-query: insert failed", error);
    return NextResponse.json({ success: false, error: "insert failed", speech: SAVE_FAILED_SPEECH }, { status: 500 });
  }

  const ref = data.reference_number as string;
  return NextResponse.json({
    success: true,
    reference_number: ref,
    speech: `I've noted that down and passed it to the team. Your reference is ${ref.replace("-", " ")}. Someone will come back to you; I can't promise any outcome myself.`,
  });
});
