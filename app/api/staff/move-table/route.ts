import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability, restaurantMismatch } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Staff action: move a seated party (its open table session, with all its orders)
// to another FREE table. Capability move_table (every role).
//
// The orders keep their numbers: they are linked to the session, and only the
// session's table changes. move_table_tx (migration 0027) locks the session and the
// one-open-session-per-table index (0009) refuses an occupied table, so two
// staff can never double-seat. A table with fewer seats than the party is allowed:
// the answer carries seats_warning = true. The restaurant comes from the login
// session; a table or session of another restaurant is "not found".

const bodySchema = z.object({
  restaurant_id: z.guid().optional(),
  table_session_id: z.guid(),
  to_table_id: z.guid(),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

const RPC_ERRORS: Record<string, [string, number]> = {
  session_not_found: ["that table is not seated any more", 404],
  table_not_found: ["the new table was not found", 404],
  same_table: ["the party is already at that table", 409],
  table_busy: ["the new table is not free", 409],
};

export async function POST(request: Request) {
  const auth = await requireCapability(request, "move_table");
  if (!auth.ok) return auth.response;
  const rid = auth.staff.restaurantId;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(`invalid body: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400);
  }
  const mismatch = restaurantMismatch(parsed.data.restaurant_id, auth.staff);
  if (mismatch) return mismatch;

  const { data, error } = await supabaseAdmin.rpc("move_table_tx", {
    p_restaurant_id: rid,
    p_staff_id: auth.staff.staffId,
    p_session_id: parsed.data.table_session_id,
    p_to_table_id: parsed.data.to_table_id,
  });
  if (error || !data) {
    console.error("move-table: move_table_tx failed", error);
    return fail("could not move the table", 500);
  }
  const result = data as { ok: boolean; error?: string; from_table?: string; to_table?: string; seats?: number; party_size?: number; seats_warning?: boolean };
  if (!result.ok) {
    const [message, status] = RPC_ERRORS[result.error ?? ""] ?? ["could not move the table", 500];
    return fail(message, status);
  }
  return NextResponse.json({
    success: true,
    from_table: result.from_table,
    to_table: result.to_table,
    seats: result.seats,
    party_size: result.party_size,
    seats_warning: !!result.seats_warning,
  });
}
