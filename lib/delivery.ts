// Delivery-area rules shared by check-delivery and create-order,
// so the agent can never be told "yes we deliver" by one and "no" by the other.

export const DELIVERY_ETA_MINUTES = 45;
export const PICKUP_ETA_MINUTES = 20;

/** Spoken when the restaurant's delivery fee isn't configured. Never promise free delivery. */
export const FEE_MISSING_SPEECH =
  "Could you hold on one moment while I check that with the team?";

/** "m14 5tp" -> "M14", "M1" -> "M1", "hello" -> "HELLO". */
export function outwardCode(raw: string): string {
  const pc = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // A full UK postcode ends in a 3-character inward code: digit + two letters.
  return /^[A-Z0-9]{2,4}\d[A-Z]{2}$/.test(pc) ? pc.slice(0, -3) : pc;
}

// TODO(geocoding): replace this hardcoded M1–M23 check with real geocoding.
// Look up the caller's postcode (e.g. postcodes.io), measure the distance
// to the restaurant's own postcode, and compare against
// restaurants.delivery_radius_miles.
export function inDeliveryArea(postcode: string): boolean {
  const m = /^M(\d{1,2})$/.exec(outwardCode(postcode));
  if (!m) return false;
  const district = Number(m[1]);
  return district >= 1 && district <= 23;
}
