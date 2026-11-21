import { NextResponse } from "next/server";
import { generatePassword, hashPassword } from "@/lib/passwords";
import { STAFF_ERRORS, staffActionSchema } from "@/lib/staff-accounts";
import { requireCapability, restaurantMismatch } from "@/lib/staff-auth";
import { normalizeUsername } from "@/lib/staff-login";
import { supabaseAdmin } from "@/lib/supabase/server";

// Owner action from the Staff page: create a login, change its role, switch it
// off or on, or reset its password.
// Body: { action: "create", username, role } | { action: "set_role", staff_id, role }
//     | { action: "deactivate" | "activate" | "reset_password", staff_id }
//   - Capability staff_manage (lib/permissions.ts: owner only); others get 403.
//   - The restaurant comes from the login; a different restaurant_id in the body = 403,
//     and a staff_id of another restaurant is simply "not found" (404).
//   - create / reset_password: the server makes a strong random password and
//     returns it ONCE in this response. Only its scrypt hash is stored; it is
//     never logged. The account must change it at its next login.
//   - Each change and its staff_account_events row are written by ONE database
//     function (manage_staff_account_tx, migration 0023), which also guards the
//     last active owner. Role change, switch-off and reset end that account's
//     open sessions at once (session_version + 1).

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number, message?: string) =>
  NextResponse.json({ success: false, error, ...(message ? { message } : {}) }, { status, headers: NO_STORE });

export async function POST(request: Request) {
  const auth = await requireCapability(request, "staff_manage");
  if (!auth.ok) return auth.response;
  const { restaurantId: rid, staffId } = auth.staff;

  const raw = await request.json().catch(() => null);
  const bodyRid = raw && typeof raw === "object" ? (raw as Record<string, unknown>).restaurant_id : undefined;
  const mismatch = typeof bodyRid === "string" ? restaurantMismatch(bodyRid, auth.staff) : null;
  if (mismatch) return mismatch;
  const parsed = staffActionSchema.safeParse(raw);
  if (!parsed.success) return fail("invalid request", 400, parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  const body = parsed.data;

  const password = body.action === "create" || body.action === "reset_password" ? generatePassword() : null;
  const username = body.action === "create" ? normalizeUsername(body.username) : null;

  const { data, error } = await supabaseAdmin.rpc("manage_staff_account_tx", {
    p_restaurant_id: rid,
    p_actor_id: staffId,
    p_action: body.action,
    p_target_id: "staff_id" in body ? body.staff_id : null,
    p_username: username,
    p_role: "role" in body ? body.role : null,
    p_password_hash: password ? await hashPassword(password) : null,
  });
  if (error || !data) {
    // Only the database error is logged: never the password or its hash.
    console.error("staff accounts: the change failed (nothing was saved)", error?.message ?? error);
    return fail("could not save", 500);
  }

  const result = data as { ok: boolean; error?: string; id?: string; changed?: boolean };
  if (!result.ok) {
    const known = STAFF_ERRORS[result.error ?? ""];
    return fail(result.error ?? "unknown", known?.status ?? 400, known?.message);
  }
  return NextResponse.json(
    {
      success: true,
      staff_id: result.id,
      changed: result.changed ?? true,
      ...(username ? { username } : {}),
      // The one and only time this password is ever sent anywhere.
      ...(password ? { password } : {}),
    },
    { headers: NO_STORE },
  );
}
