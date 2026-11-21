import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/passwords";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { MIN_PASSWORD_LENGTH, passwordChangeSchema } from "@/lib/staff-accounts";
import { requireStaff } from "@/lib/staff-auth";
import { LOCK_MINUTES, checkOwnPassword } from "@/lib/staff-login";
import { supabaseAdmin } from "@/lib/supabase/server";

// Any logged-in user changes their OWN password.
// Body: { current_password, new_password }   (new: at least 10 characters, not the same as the old one)
//   - Works while the account must still change its password (that is what it is for).
//   - A wrong current password counts towards the login lock-out (5 wrong -> locked
//     15 minutes, 429 "locked"); the right one clears the counter.
//   - The save and its staff_account_events row are ONE database function
//     (change_own_password_tx, migration 0023). It raises session_version, so
//     every other open session of this account ends; this browser gets a fresh
//     cookie with the new version and stays logged in.
//   - Passwords are never logged or stored as they are.

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number, message: string) =>
  NextResponse.json({ success: false, error, message }, { status, headers: NO_STORE });

export async function POST(request: Request) {
  const auth = await requireStaff(request, { allowPasswordChange: true });
  if (!auth.ok) return auth.response;
  const { staffId, restaurantId, role } = auth.staff;

  const parsed = passwordChangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("invalid request", 400, `Enter your current password and a new one of at least ${MIN_PASSWORD_LENGTH} characters.`);
  const { current_password: current, new_password: next } = parsed.data;
  if (current === next) return fail("same_password", 400, "The new password must be different from the current one.");

  // Same lock-out as login (lib/staff-login.ts): 5 wrong current passwords lock the account for 15 minutes.
  const checked = await checkOwnPassword(staffId, restaurantId, current);
  if (!checked.ok) {
    if (checked.reason === "locked") {
      return fail("locked", 429, `Too many wrong passwords. This login is locked for ${LOCK_MINUTES} minutes; try again later.`);
    }
    if (checked.reason === "wrong") return fail("wrong_current_password", 400, "The current password is not right.");
    return fail("unavailable", 500, "Could not change the password. Please try again.");
  }
  const storedHash = checked.passwordHash;

  const { data, error } = await supabaseAdmin.rpc("change_own_password_tx", {
    p_restaurant_id: restaurantId,
    p_staff_id: staffId,
    p_expected_hash: storedHash,
    p_new_hash: await hashPassword(next),
  });
  if (error || !data) {
    console.error("password: the change failed (nothing was saved)", error?.message ?? error);
    return fail("unavailable", 500, "Could not change the password. Please try again.");
  }
  const result = data as { ok: boolean; error?: string; session_version?: number };
  if (!result.ok || typeof result.session_version !== "number") {
    if (result.error === "stale") return fail("stale", 409, "Your password was just reset by the owner. Please log in again.");
    return fail(result.error ?? "unknown", 403, "Could not change the password.");
  }

  const res = NextResponse.json({ success: true }, { headers: NO_STORE });
  res.cookies.set(
    SESSION_COOKIE,
    signSession({ staffId, restaurantId, role, sessionVersion: result.session_version }),
    sessionCookieOptions(),
  );
  return res;
}
