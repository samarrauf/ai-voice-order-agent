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

// ---------------------------------------------------------------------------
// Delivery modes (restaurants.delivery_mode, migration 0022). ONE decision,
// used by check-delivery, create-order, manual-order and price-preview, so the
// agent and the POS can never disagree about where we deliver or what it costs.
//   'postcode'  = the postcode check above (exactly as before 0022).
//   'area_list' = the area the customer names must be on the restaurant's
//                 ACTIVE list in delivery_areas. An empty list = no delivery.
//   'none'      = no delivery at all.

export type DeliveryMode = "postcode" | "area_list" | "none";

/** A missing value (an old row) is 'postcode', today's behaviour. Anything unknown fails closed to 'none'. */
export function deliveryModeOf(value: unknown): DeliveryMode {
  if (value === null || value === undefined || value === "postcode") return "postcode";
  return value === "area_list" ? "area_list" : "none";
}

export type DeliveryAreaRow = { label: string; fee_override: number | string | null; is_active: boolean };

/** The columns every route reads from delivery_areas. */
export const DELIVERY_AREA_SELECT = "label, fee_override, is_active";

/**
 * Light normalising for matching what a caller said against the list:
 * lower case, and spaces, dashes and underscores ignored.
 * "Satellite Town", "satellite-town" and "SatelliteTown" all match.
 */
export function areaKey(raw: string): string {
  return raw.toLowerCase().replace(/[\s\-‐-―_]+/g, "");
}

/** The ACTIVE area matching what the caller said, or null. Inactive areas never match. */
export function findDeliveryArea(raw: string | null | undefined, areas: DeliveryAreaRow[]): DeliveryAreaRow | null {
  const key = areaKey(raw ?? "");
  if (!key) return null;
  return areas.find((a) => a.is_active && areaKey(a.label) === key) ?? null;
}

export type DeliveryRefusal = "postcode_missing" | "outside_postcode" | "area_missing" | "area_not_listed" | "no_delivery";

export type DeliveryDecision =
  | {
      ok: true;
      /** The matched area (area_list mode only). */
      area: DeliveryAreaRow | null;
      /** The raw fee to read with deliveryFeePence: the area's fee_override if set, else restaurants.delivery_fee. */
      fee: number | string | null;
    }
  | { ok: false; reason: DeliveryRefusal };

/**
 * Can we deliver here, and at what fee? `areas` are the restaurant's rows from
 * delivery_areas (inactive rows may be included; they never match).
 */
export function decideDelivery(
  mode: DeliveryMode,
  where: { postcode?: string | null; area?: string | null },
  areas: DeliveryAreaRow[],
  restaurantFee: number | string | null,
): DeliveryDecision {
  if (mode === "postcode") {
    if (!where.postcode) return { ok: false, reason: "postcode_missing" };
    if (!inDeliveryArea(where.postcode)) return { ok: false, reason: "outside_postcode" };
    return { ok: true, area: null, fee: restaurantFee };
  }
  if (mode === "area_list") {
    if (!areas.some((a) => a.is_active)) return { ok: false, reason: "no_delivery" };
    if (!where.area || !areaKey(where.area)) return { ok: false, reason: "area_missing" };
    const area = findDeliveryArea(where.area, areas);
    if (!area) return { ok: false, reason: "area_not_listed" };
    return { ok: true, area, fee: area.fee_override ?? restaurantFee };
  }
  return { ok: false, reason: "no_delivery" };
}

/** Spoken refusals. The agent never promises delivery on its own; these offer collection instead. */
export const OUTSIDE_POSTCODE_SPEECH =
  "Sorry, we don't deliver to that postcode, but you're welcome to collect. Would you like to do collection?";
export const AREA_NOT_LISTED_SPEECH =
  "Sorry, we don't deliver to that area, but you're welcome to collect. Would you like to do collection?";
export const NO_DELIVERY_SPEECH =
  "Sorry, we don't do delivery, but you're welcome to collect. Would you like to do collection?";
export const AREA_MISSING_SPEECH = "Which area are you in for the delivery?";

/** The staff-facing (POS) wording for a refusal. */
export const DELIVERY_REFUSAL_ERROR: Record<DeliveryRefusal, string> = {
  postcode_missing: "a postcode is required for a delivery order",
  outside_postcode: "we do not deliver to that postcode",
  area_missing: "delivery_area is required for a delivery order",
  area_not_listed: "we do not deliver to that area",
  no_delivery: "this restaurant does not deliver",
};

/** "12 Main Road" + "Satellite Town" -> "12 Main Road, Satellite Town" (not added twice). */
export function addressWithArea(address: string, area: DeliveryAreaRow | null): string {
  if (!area) return address;
  return areaKey(address).includes(areaKey(area.label)) ? address : `${address}, ${area.label}`;
}
