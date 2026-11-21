import { supabaseAdmin } from "@/lib/supabase/server";
import { burnPasswordCheck, verifyPassword } from "@/lib/passwords";
import type { StaffRole } from "@/lib/session";

// Checks a username + password against staff_accounts (migration 0017).
//
// Rules:
//   - Unknown username, wrong password, locked account and inactive account all
//     give the SAME answer, so nobody can find out which usernames exist.
//   - 5 wrong passwords in a row lock the account for 15 minutes. While locked,
//     even the right password is refused.
//   - A successful login clears the counter and the lock.
// The password is checked (slow scrypt work) in every case, so the answer time
// gives nothing away either.

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,49}$/;

export type LoginResult =
  | { ok: true; staff: { staffId: string; restaurantId: string; role: StaffRole } }
  | { ok: false; reason: "invalid" | "unavailable" };

type AccountRow = {
  id: string;
  restaurant_id: string;
  password_hash: string;
  role: StaffRole;
  is_active: boolean;
  failed_attempts: number;
  locked_until: string | null;
};

const ACCOUNT_SELECT = "id, restaurant_id, password_hash, role, is_active, failed_attempts, locked_until";

/** "  Napoli-Owner " -> "napoli-owner" */
export const normalizeUsername = (raw: string) => raw.trim().toLowerCase();

const isLocked = (row: AccountRow, now: Date) => !!row.locked_until && new Date(row.locked_until).getTime() > now.getTime();

/**
 * Adds one failed attempt. The update only lands if the counter is still the
 * value we read, so two wrong guesses sent at the same moment both count (no
 * "free" extra guesses). The 5th failure sets the lock and starts the count again.
 */
async function recordFailure(row: AccountRow, now: Date): Promise<void> {
  let current = row;
  for (let tries = 0; tries < 5; tries++) {
    if (isLocked(current, now)) return;
    const next = current.failed_attempts + 1;
    const lock = next >= MAX_FAILED_ATTEMPTS;
    const { data, error } = await supabaseAdmin
      .from("staff_accounts")
      .update({
        failed_attempts: lock ? 0 : next,
        locked_until: lock ? new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString() : current.locked_until,
      })
      .eq("id", current.id)
      .eq("failed_attempts", current.failed_attempts)
      .select("id");
    if (error) {
      console.error("staff-login: could not record failed attempt", error);
      return;
    }
    if (data && data.length > 0) return;
    // Someone else changed the row first: read it again and retry.
    const fresh = await supabaseAdmin.from("staff_accounts").select(ACCOUNT_SELECT).eq("id", current.id).maybeSingle();
    if (fresh.error || !fresh.data) return;
    current = fresh.data as AccountRow;
  }
}

export type OwnPasswordCheck = { ok: true; passwordHash: string } | { ok: false; reason: "wrong" | "locked" | "unavailable" };

/**
 * The "current password" check on the change-password page (/api/staff/password).
 * The SAME lock-out as login: a wrong password counts towards the same 5-tries
 * counter (recordFailure), a locked account is refused even with the right
 * password, and the right password clears the counter. Only this account's row is touched.
 * "locked" is also returned for the wrong try that sets the lock.
 */
export async function checkOwnPassword(staffId: string, restaurantId: string, password: string, now = new Date()): Promise<OwnPasswordCheck> {
  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .select(ACCOUNT_SELECT)
    .eq("id", staffId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error || !data) {
    console.error("staff-login: could not read the account for a password check", error?.message ?? "not found");
    return { ok: false, reason: "unavailable" };
  }
  const row = data as AccountRow;
  const passwordOk = await verifyPassword(password, row.password_hash);
  if (isLocked(row, now)) return { ok: false, reason: "locked" };

  if (!passwordOk) {
    await recordFailure(row, now);
    return { ok: false, reason: row.failed_attempts + 1 >= MAX_FAILED_ATTEMPTS ? "locked" : "wrong" };
  }

  if (row.failed_attempts !== 0 || row.locked_until !== null) {
    const { error: resetError } = await supabaseAdmin.from("staff_accounts").update({ failed_attempts: 0, locked_until: null }).eq("id", row.id);
    if (resetError) {
      console.error("staff-login: could not clear the failed-attempt counter", resetError.message);
      return { ok: false, reason: "unavailable" };
    }
  }
  return { ok: true, passwordHash: row.password_hash };
}

/**
 * After a successful authenticateStaff: the account's current session_version
 * (goes into the cookie) and whether it must change its password first.
 * null if the lookup fails (the login is then refused).
 */
export async function loadLoginState(staffId: string): Promise<{ sessionVersion: number; mustChangePassword: boolean } | null> {
  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("session_version, must_change_password")
    .eq("id", staffId)
    .maybeSingle();
  if (error || !data) {
    console.error("staff-login: could not read the session version", error);
    return null;
  }
  return { sessionVersion: data.session_version as number, mustChangePassword: data.must_change_password === true };
}

export async function authenticateStaff(rawUsername: unknown, rawPassword: unknown, now = new Date()): Promise<LoginResult> {
  const username = typeof rawUsername === "string" ? normalizeUsername(rawUsername) : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";

  if (!USERNAME.test(username) || password.length === 0 || password.length > 200) {
    await burnPasswordCheck(password.slice(0, 200) || "x");
    return { ok: false, reason: "invalid" };
  }

  const { data, error } = await supabaseAdmin.from("staff_accounts").select(ACCOUNT_SELECT).eq("username", username).maybeSingle();
  if (error) {
    console.error("staff-login: account lookup failed", error);
    return { ok: false, reason: "unavailable" };
  }
  const row = data as AccountRow | null;
  if (!row) {
    await burnPasswordCheck(password);
    return { ok: false, reason: "invalid" };
  }

  const passwordOk = await verifyPassword(password, row.password_hash);

  // Locked or switched off: refused even with the right password, and the counter is not touched.
  if (!row.is_active || isLocked(row, now)) return { ok: false, reason: "invalid" };

  if (!passwordOk) {
    await recordFailure(row, now);
    return { ok: false, reason: "invalid" };
  }

  const { error: updateError } = await supabaseAdmin
    .from("staff_accounts")
    .update({ failed_attempts: 0, locked_until: null, last_login_at: now.toISOString() })
    .eq("id", row.id);
  if (updateError) {
    console.error("staff-login: could not record successful login", updateError);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, staff: { staffId: row.id, restaurantId: row.restaurant_id, role: row.role } };
}
