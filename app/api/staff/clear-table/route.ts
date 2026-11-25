import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/permissions";
import { pence, pounds } from "@/lib/order-pricing";
import { BILL_UNPAID_ERROR } from "@/lib/tables";
import { requireStaff, restaurantMismatch } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Staff action: the party has left, free the table. Sets cleared_at = now on
// the session. A session that is already cleared can't be cleared again.
// Only a session of the logged-in restaurant can be cleared (others are 404).

const bodySchema = z.object({
  // Optional: older dashboard tabs still send it. The restaurant itself comes from the login session.
  restaurant_id: z.guid().optional(),
  table_session_id: z.guid(),
  // "Clear anyway": the party left without paying. Owner/manager only (capability clear_unpaid).
  // The unpaid orders stay as they are (they remain on the Orders board) and each gets a
  // 'cleared_unpaid' row in order_events.
  clear_unpaid: z.boolean().optional(),
});

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

type Owing = { id: string; order_number: string; total: number | string; owed: number };

/** One 'cleared_unpaid' event per order that still owed money: who cleared it, and how much was left. */
async function logUnpaid(rid: string, staffId: string, sessionId: string, owing: Owing[]): Promise<boolean> {
  const { error } = await supabaseAdmin.from("order_events").insert(
    owing.map((o) => ({
      restaurant_id: rid,
      order_id: o.id,
      staff_id: staffId,
      event: "cleared_unpaid",
      detail: { order_number: o.order_number, owed: pounds(o.owed), total: Number(o.total), table_session_id: sessionId },
    })),
  );
  return !error;
}

export async function POST(request: Request) {
  const auth = await requireStaff(request);
  if (!auth.ok) return auth.response;
  const rid = auth.staff.restaurantId;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("invalid body: table_session_id must be a valid id", 400);
  const { table_session_id } = parsed.data;
  const mismatch = restaurantMismatch(parsed.data.restaurant_id, auth.staff);
  if (mismatch) return mismatch;
  if (parsed.data.clear_unpaid && !can(auth.staff.role, "clear_unpaid")) return fail("forbidden", 403);

  // A plain clear (no clear_unpaid flag) refuses a table that still owes money, whatever the UI shows.
  // Tables with no order at all (e.g. a booked party that never ordered) and fully paid tables clear as before.
  // The amounts come from the database. Cancelled and merged orders carry no bill.
  if (!parsed.data.clear_unpaid) {
    const { data: live, error: liveErr } = await supabaseAdmin
      .from("orders")
      .select("total, paid_amount")
      .eq("restaurant_id", rid)
      .eq("table_session_id", table_session_id)
      .not("status", "in", "(cancelled,merged)");
    if (liveErr) {
      console.error("clear-table: could not check the bill", liveErr);
      return fail("could not check the bill", 500);
    }
    if ((live ?? []).some((o) => pence(o.total) > pence(o.paid_amount))) return fail(BILL_UNPAID_ERROR, 409);
  }

  // One atomic statement: only an OPEN session matches, so two staff pressing
  // "clear" together can't both succeed.
  const { data: cleared, error } = await supabaseAdmin
    .from("table_sessions")
    .update({ cleared_at: new Date().toISOString() })
    .eq("id", table_session_id)
    .eq("restaurant_id", rid)
    .is("cleared_at", null)
    .select("id, table_id, seated_at, cleared_at");
  if (error) {
    console.error("clear-table: update failed", error);
    return fail("could not clear the table", 500);
  }
  if (cleared && cleared.length > 0) {
    if (parsed.data.clear_unpaid) {
      // The amounts come from the database, never from the request.
      const { data: orders, error: ordersErr } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, total, paid_amount")
        .eq("restaurant_id", rid)
        .eq("table_session_id", table_session_id)
        .not("status", "in", "(cancelled,merged)");
      const owing = (orders ?? [])
        .map((o) => ({ ...o, owed: Math.max(0, pence(o.total) - pence(o.paid_amount)) }))
        .filter((o) => o.owed > 0);
      if (ordersErr || (owing.length > 0 && !(await logUnpaid(rid, auth.staff.staffId, table_session_id, owing)))) {
        console.error("clear-table: could not write cleared_unpaid events", ordersErr);
        return NextResponse.json({ success: true, session: cleared[0], audit_warning: "table cleared but the unpaid record could not be saved" });
      }
      return NextResponse.json({ success: true, session: cleared[0], unpaid_orders: owing.length, unpaid_total: pounds(owing.reduce((n, o) => n + o.owed, 0)) });
    }
    return NextResponse.json({ success: true, session: cleared[0] });
  }

  // Nothing updated: either it doesn't exist or it was already cleared.
  const { data: existing } = await supabaseAdmin.from("table_sessions").select("id").eq("id", table_session_id).eq("restaurant_id", rid).maybeSingle();
  return existing ? fail("table is already cleared", 409) : fail("table session not found", 404);
}
