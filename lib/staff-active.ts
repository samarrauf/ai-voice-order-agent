import { supabaseAdmin } from "@/lib/supabase/server";
import type { StaffRole, StaffSession } from "@/lib/session";

// The login cookie is signed and lasts 12 hours, so by itself it cannot be
// "switched off". This check runs on every dashboard page and every
// /api/staff/* call: it looks the account up (one lookup by primary key) and
// refuses it if the owner has set is_active = false, or deleted the account,
// or moved it to another restaurant. The role also comes from the database,
// so a role change takes effect straight away too.
//
// It FAILS CLOSED: if the lookup errors, nobody gets in for that request.

type Row = { restaurant_id: string; role: StaffRole; is_active: boolean };

/** The same session if the account is still active, with the current role from the database; otherwise null. */
export async function confirmStaffActive(session: StaffSession): Promise<StaffSession | null> {
  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("restaurant_id, role, is_active")
    .eq("id", session.staffId)
    .maybeSingle();
  if (error) {
    console.error("staff-active: account lookup failed, refusing this request", error);
    return null;
  }
  const row = data as Row | null;
  if (!row || !row.is_active) return null;
  if (row.restaurant_id.toLowerCase() !== session.restaurantId.toLowerCase()) return null;
  return { ...session, role: row.role };
}
