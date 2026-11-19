import { createHmac, timingSafeEqual } from "node:crypto";

// The staff login cookie. After a correct username + password the browser gets
//   <payload>.<signature>
// payload   = base64url JSON { sid: staff id, rid: restaurant id, role, exp }
// signature = HMAC-SHA256 of the payload with SESSION_SECRET.
//
// The restaurant a staff member works for is read ONLY from here, never from
// what the browser sends. Without SESSION_SECRET nobody can make or change a
// token. Changing SESSION_SECRET logs everyone out.

export const SESSION_COOKIE = "staff_session";
export const SESSION_HOURS = 12;
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

export type StaffRole = "owner" | "staff";
export const STAFF_ROLES: readonly StaffRole[] = ["owner", "staff"];

export type StaffSession = {
  staffId: string;
  restaurantId: string;
  role: StaffRole;
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
  staff: { staffId: string; restaurantId: string; role: StaffRole },
  now = Date.now(),
  secret?: string,
): string {
  const key = getSessionSecret(secret);
  const payload = Buffer.from(
    JSON.stringify({ sid: staff.staffId, rid: staff.restaurantId, role: staff.role, exp: now + SESSION_MS }),
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
  const { sid, rid, role, exp } = data as Record<string, unknown>;
  if (typeof sid !== "string" || !UUID.test(sid)) return null;
  if (typeof rid !== "string" || !UUID.test(rid)) return null;
  if (role !== "owner" && role !== "staff") return null;
  if (typeof exp !== "number" || !Number.isFinite(exp) || exp <= now) return null;
  return { staffId: sid, restaurantId: rid, role, expiresAt: exp };
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

/** True if `session` is allowed to act as `role`. An owner can do everything staff can. */
export function hasRole(session: StaffSession, role: StaffRole): boolean {
  return role === "staff" || session.role === "owner";
}
