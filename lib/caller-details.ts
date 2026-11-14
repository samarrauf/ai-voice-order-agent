// JUNK GUARD for caller details. The model has sent "Unknown" / "0" / {} before
// it had the caller's real details. Saving those gives staff a callback or a
// booking they can't act on, so tool routes reject them (400) and ask the
// caller for the real value. Shared by request-callback and create-booking.

const PLACEHOLDER_NAMES = new Set([
  "unknown", "unknown caller", "caller", "the caller", "customer", "the customer", "anonymous",
  "name", "no name", "not given", "not provided", "n a", "na", "none", "null", "undefined", "tbc", "test",
]);

export function isRealName(raw: string): boolean {
  const name = raw.trim().toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return /[a-z]/.test(name) && !PLACEHOLDER_NAMES.has(name);
}

/** Expects a phone already passed through normalizePhone. */
export function isRealPhone(normalized: string): boolean {
  const d = normalized.replace("+", "");
  return d.length >= 10 && normalized.length <= 16 && !/^(\d)\1+$/.test(d); // not "0000000000"
}
