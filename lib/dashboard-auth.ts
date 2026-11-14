import { createHash, createHmac, timingSafeEqual } from "crypto";

// Simple one-password login for /dashboard. After a correct password we hand
// the browser a signed token "<expiry>.<signature>". The signature is made
// with a key derived from DASHBOARD_PASSWORD, so nobody can forge a token
// without knowing the password, and changing the password logs everyone out.

export const SESSION_COOKIE = "dashboard_session";
export const SESSION_DAYS = 7;

const sha256 = (v: string) => createHash("sha256").update(v, "utf8").digest();

/** True only if `input` equals the configured password. Fails closed if unset. */
export function checkPassword(input: string, expected = process.env.DASHBOARD_PASSWORD): boolean {
  if (!expected) return false;
  // Hash both so the buffers are equal length (timingSafeEqual would throw otherwise).
  return timingSafeEqual(sha256(input), sha256(expected));
}

function sign(expiry: string, password: string): string {
  const key = sha256(`dashboard-session:${password}`);
  return createHmac("sha256", key).update(expiry).digest("hex");
}

/** Makes a token valid for SESSION_DAYS from `now`. Null if no password is configured. */
export function createSessionToken(now = Date.now(), password = process.env.DASHBOARD_PASSWORD): string | null {
  if (!password) return null;
  const expiry = String(now + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return `${expiry}.${sign(expiry, password)}`;
}

/** True if the token is genuinely ours and hasn't expired. */
export function verifySessionToken(
  token: string | undefined | null,
  now = Date.now(),
  password = process.env.DASHBOARD_PASSWORD,
): boolean {
  if (!token || !password) return false;
  const [expiry, signature, ...rest] = token.split(".");
  if (!expiry || !signature || rest.length > 0 || !/^\d+$/.test(expiry)) return false;
  if (!timingSafeEqual(sha256(signature), sha256(sign(expiry, password)))) return false;
  return Number(expiry) > now;
}
