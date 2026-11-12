import { NextResponse } from "next/server";
import { z } from "zod";
import { requireToolSecret } from "@/lib/auth";
import { getRestaurantStatus } from "@/lib/restaurant-status";
import { timed } from "@/lib/timing";

// Is the restaurant open right now (Europe/London), and if not, when does it
// next open? Called ONCE at the start of every call — by our chat test rig
// now, and in Phase 4 by our server when Vapi asks for the call's assistant —
// and injected into the system prompt, so the agent knows from its first word.

const bodySchema = z.object({
  restaurant_id: z.guid(), // seeded demo ids aren't RFC-version UUIDs
});

export const POST = timed("restaurant-status", async (request: Request, timer) => {
  const denied = requireToolSecret(request);
  timer.lap("auth");
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  timer.lap("parse");
  if (!parsed.success) {
    return NextResponse.json({ error: "body must be { restaurant_id: uuid }", speech: null }, { status: 400 });
  }

  try {
    const status = await getRestaurantStatus(parsed.data.restaurant_id);
    timer.lap("db");
    if (!status) {
      return NextResponse.json({ error: "restaurant not found", speech: null }, { status: 404 });
    }
    return NextResponse.json(status);
  } catch (error) {
    console.error("restaurant-status: lookup failed", error);
    return NextResponse.json({ error: "status lookup failed", speech: null }, { status: 500 });
  }
});
