import { NextResponse } from "next/server";
import { z } from "zod";
import { requireToolSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizePhone, phoneForSpeech } from "@/lib/speech";
import { timed } from "@/lib/timing";

// Voice-agent tool: save a callback request so a staff member rings the caller back.
// Used for allergen questions (never answered by the agent), tool failures,
// and anything the agent can't handle.
//
// ECHO-BACK RULE: the speech reads back the phone number exactly as STORED.
// If the agent mis-copied it, the caller hears the wrong number and says so;
// the agent then calls again with callback_id, which UPDATES the same row —
// so staff never see two requests and have to guess which number is right.
//
// TODO(phase 4): link call_id once Vapi call rows exist in public.calls.

const bodySchema = z.object({
  restaurant_id: z.guid(), // seeded demo ids aren't RFC-version UUIDs
  callback_id: z.guid().nullish(), // set = correct an earlier request instead of creating a new one
  customer_name: z.string().trim().min(1).max(100),
  customer_phone: z
    .string()
    .transform(normalizePhone)
    .refine((p) => p.replace("+", "").length >= 10 && p.length <= 16),
  reason: z.enum(["allergen", "problem", "other"]),
  details: z.string().trim().max(500).nullish(),
});

const SAVE_FAILED_SPEECH = "Sorry, I couldn't save that just now. Could you ring the shop back in a few minutes?";

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

  const { restaurant_id, callback_id, customer_name, customer_phone, reason, details } = parsed.data;
  const row = { customer_name, customer_phone, reason, details: details ?? null };

  // Correction: update the existing pending request (same restaurant only).
  // If it can't be found, fall through and create a new one so nothing is lost.
  let saved: { id: string; customer_phone: string } | null = null;
  let updated = false;
  if (callback_id) {
    const { data, error } = await supabaseAdmin
      .from("callback_requests")
      .update(row)
      .eq("id", callback_id)
      .eq("restaurant_id", restaurant_id)
      .eq("status", "pending")
      .select("id, customer_phone")
      .maybeSingle();
    if (error) {
      console.error("request-callback: update failed", error);
      return NextResponse.json({ success: false, error: "update failed", speech: SAVE_FAILED_SPEECH }, { status: 500 });
    }
    saved = data;
    updated = data !== null;
  }
  if (!saved) {
    const { data, error } = await supabaseAdmin
      .from("callback_requests")
      .insert({ restaurant_id, ...row })
      .select("id, customer_phone")
      .single();
    if (error || !data) {
      console.error("request-callback: insert failed", error);
      return NextResponse.json({ success: false, error: "insert failed", speech: SAVE_FAILED_SPEECH }, { status: 500 });
    }
    saved = data;
  }
  timer.lap("db");

  const firstName = customer_name.split(/\s+/)[0];
  return NextResponse.json({
    success: true,
    callback_id: saved.id,
    updated,
    stored_phone: saved.customer_phone,
    // Built from the STORED value, never from the request.
    speech: `Thanks ${firstName}, someone will ring you back on ${phoneForSpeech(saved.customer_phone)}. Is that the right number?`,
  });
});
