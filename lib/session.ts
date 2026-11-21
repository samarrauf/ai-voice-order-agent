import { createHmac, timingSafeEqual } from "node:crypto";
import { STAFF_ROLES, isStaffRole, type StaffRole } from "@/lib/permissions";

// The staff login cookie. After a correct username + password the browser gets
//   <payload>.<signature>
// payload   = base64url JSON { sid: staff id, rid: restaurant id, role, ver, exp }
// signature = HMAC-SHA256 of the payload with SESSION_SECRET.
//
// `ver` is the account's session_version (migration 0023). A password change or
// reset, switching the account off or a role change raises it in the database,
// and lib/staff-active.ts then refuses every older cookie. Cookies made before
// P8c have no `ver`; they count as version 1 (the starting version).
//
// The restaurant a staff member works for is read ONLY from here, never from
// what the browser sends. Without SESSION_SECRET nobody can make or change a
// token. Changing SESSION_SECRET logs everyone out.

export const SESSION_COOKIE = "staff_session";
export const SESSION_HOURS = 12;
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

export { STAFF_ROLES, type StaffRole };

export type StaffSession = {
  staffId: string;
  restaurantId: string;
  role: StaffRole;
  /** The session_version this cookie was made with. */
  sessionVersion: number;
  /** From the database (lib/staff-active.ts): the user must pick a new password first. Always false straight from a cookie. */
  mustChangePassword: boolean;
  /** Expiry, milliseconds since 1970. */
  expiresAt: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 32 random bytes written as base64url is 43 characters; anything shorter is too weak. */
const MIN_SECRET_LENGTH = 43;

/** The signing secret. Throws a clear error if it is missing or too short: there is NO fallback secret. */
export function getSessionSecret(secret = process.env.SESSION_SECRET): string {
  if (!secret) throw new Error("SESSION_SECRET is not set. Add it to .env.local (and to Vercel) before using the dashboard.");
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET is too short (needs at least ${MIN_SECRET_LENGTH} characters of random data).`);
  }
  return secret;
}

const hmac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload, "utf8").digest();

/** Makes a token for this staff member, valid for SESSION_HOURS from `now`. */
export function signSession(
  staff: { staffId: string; restaurantId: string; role: StaffRole; sessionVersion?: number },
  now = Date.now(),
  secret?: string,
): string {
  const key = getSessionSecret(secret);
  const ver = staff.sessionVersion ?? 1;
  if (!Number.isInteger(ver) || ver < 1) throw new Error("sessionVersion must be a whole number of at least 1");
  const payload = Buffer.from(
    JSON.stringify({ sid: staff.staffId, rid: staff.restaurantId, role: staff.role, ver, exp: now + SESSION_MS }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${hmac(payload, key).toString("base64url")}`;
}

/** The session inside a token, or null if it is missing, tampered with, badly formed or expired. */
export function verifySession(token: string | undefined | null, now = Date.now(), secret?: string): StaffSession | null {
  const key = getSessionSecret(secret);
  if (!token || token.length > 1000) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signature] = parts;

  const given = Buffer.from(signature, "base64url");
  const expected = hmac(payload, key);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { sid, rid, role, ver = 1, exp } = data as Record<string, unknown>;
  if (typeof sid !== "string" || !UUID.test(sid)) return null;
  if (typeof rid !== "string" || !UUID.test(rid)) return null;
  if (!isStaffRole(role)) return null;
  if (typeof ver !== "number" || !Number.isInteger(ver) || ver < 1) return null;
  if (typeof exp !== "number" || !Number.isFinite(exp) || exp <= now) return null;
  return { staffId: sid, restaurantId: rid, role, sessionVersion: ver, mustChangePassword: false, expiresAt: exp };
}

/** Cookie settings for the login cookie. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  };
}

const RANK: Record<StaffRole, number> = { staff: 1, manager: 2, owner: 3 };

/**
 * True if `session` is at least `role` (owner > manager > staff). Prefer
 * can(role, capability) from lib/permissions.ts for new checks.
 */
export function hasRole(session: StaffSession, role: StaffRole): boolean {
  return RANK[session.role] >= RANK[role];
}
