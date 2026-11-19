import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Password hashing for staff logins. Node's built-in scrypt, no extra package.
//
// A stored hash looks like:  scrypt$<N>$<r>$<p>$<salt>$<hash>
// (salt and hash in base64url). The cost settings travel inside the string, so
// they can be raised later: old hashes keep verifying with their own settings.
//
// This file has no Next.js imports, so scripts/create-staff-account.mjs can use it too.

const N = 16384; // CPU/memory cost (2^14)
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function scryptAsync(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Makes a new hash with a fresh random salt. Never store the password itself. */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length === 0) throw new Error("password must be a non-empty string");
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

const isPowerOfTwo = (n: number) => n > 1 && (n & (n - 1)) === 0;

/** True only if `password` matches `stored`. A broken or unknown hash string is simply false. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  // Sane limits, so a strange value can't make the server do huge work.
  if (!isPowerOfTwo(n) || n > 2 ** 20 || !Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16) {
    return false;
  }
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (salt.length < 8 || expected.length < 16) return false;

  const actual = await scryptAsync(password, salt, expected.length, { N: n, r, p, maxmem: 256 * 1024 * 1024 });
  return timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | null = null;

/**
 * Does the same amount of work as a real check, for an unknown username. Without
 * it, "no such user" would answer faster than "wrong password" and give away
 * which usernames exist.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummyHash);
}
