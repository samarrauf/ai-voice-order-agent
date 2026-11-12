import { NextResponse } from "next/server";
import { z } from "zod";
import { requireToolSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { timed } from "@/lib/timing";

// Voice-agent tool: save a callback request so a staff member rings the caller back.
// Used for allergen questions (never answered by the agent), tool failures,
// and anything the agent can't handle. One insert, no other queries.
//
// TODO(phase 4): link call_id once Vapi call rows exist in public.calls.

const bodySchema = z.object({
  restaurant_id: z.guid(), // seeded demo ids aren't RFC-version UUIDs
  customer_name: z.string().trim().min(1).max(100),
  customer_phone: z.string().trim().min(5).max(30),
  reason: z.enum(["allergen", "problem", "other"]),
  details: z.string().trim().max(500).nullish(),
});

export const POST = timed("request-callback", async (request: Request, timer) => {
  const denied = requireToolSecret(request);
  timer.lap("auth");
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  timer.lap("parse");
  if (!parsed.success) {
    const paths = parsed.error.issues.map((i) => i.path.join("."));
    const speech = paths.includes("customer_phone")
      ? "Sorry, could I take a number for them to call you back on?"
      : paths.includes("customer_name")
        ? "Sorry, could I take your name?"
        : "Sorry, could you tell me that again?";
    return NextResponse.json({ success: false, error: "invalid body", speech }, { status: 400 });
  }

  const { restaurant_id, customer_name, customer_phone, reason, details } = parsed.data;
  const { error } = await supabaseAdmin.from("callback_requests").insert({
    restaurant_id,
    customer_name,
    customer_phone,
    reason,
    details: details ?? null,
  });
  timer.lap("db");

  if (error) {
    console.error("request-callback: insert failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "insert failed",
        speech: "Sorry, I couldn't save that just now. Could you ring the shop back in a few minutes?",
      },
      { status: 500 },
    );
  }

  const firstName = customer_name.split(/\s+/)[0];
  return NextResponse.json({
    success: true,
    speech: `Thanks ${firstName}, someone from the shop will call you back on that number.`,
  });
});
