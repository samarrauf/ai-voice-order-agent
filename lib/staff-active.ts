import { supabaseAdmin } from "@/lib/supabase/server";
import type { StaffRole, StaffSession } from "@/lib/session";

// The login cookie is signed and lasts 12 hours, so by itself it cannot be
// "switched off". This check runs on every dashboard page and every
// /api/staff/* call: it looks the account up (one lookup by primary key) and
// refuses it if the owner has set is_active = false, or deleted the account,
// or moved it to another restaurant, or if the cookie's session_version is not
// the account's current one (password changed or reset, account switched off,
// role changed: migration 0023). The role and must_change_password also come
// from the database, so changes take effect straight away.
//
// It FAILS CLOSED: if the lookup errors, nobody gets in for that request.

type Row = { restaurant_id: string; role: StaffRole; is_active: boolean; session_version: number; must_change_password: boolean };

/** The same session if the account is still active, with the current role from the database; otherwise null. */
export async function confirmStaffActive(session: StaffSession): Promise<StaffSession | null> {
  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("restaurant_id, role, is_active, session_version, must_change_password")
    .eq("id", session.staffId)
    .maybeSingle();
  if (error) {
    console.error("staff-active: account lookup failed, refusing this request", error);
    return null;
  }
  const row = data as Row | null;
  if (!row || !row.is_active) return null;
  if (row.restaurant_id.toLowerCase() !== session.restaurantId.toLowerCase()) return null;
  if (row.session_version !== session.sessionVersion) return null;
  return { ...session, role: row.role, mustChangePassword: row.must_change_password === true };
}
