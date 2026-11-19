import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  DELIVERY_AREA_SELECT,
  DELIVERY_REFUSAL_ERROR,
  decideDelivery,
  deliveryModeOf,
  type DeliveryAreaRow,
} from "@/lib/delivery";
import type { BillSettingsRow } from "@/lib/order-pricing";

// The POS side of the delivery rules (manual-order and price-preview). The
// decision itself is lib/delivery.ts decideDelivery, the same one the phone
// agent uses, so an area's fee is identical on the POS and on the phone.

/** The restaurant's ACTIVE delivery areas (one query). */
export const activeDeliveryAreas = (restaurantId: string) =>
  supabaseAdmin.from("delivery_areas").select(DELIVERY_AREA_SELECT).eq("restaurant_id", restaurantId).eq("is_active", true);

export type StaffDeliveryResult =
  | { ok: true; settings: BillSettingsRow; area: DeliveryAreaRow | null }
  | { ok: false; error: string };

/**
 * For a POS delivery order:
 *   'postcode'  -> unchanged from before 0022 (the POS never checked postcodes).
 *   'area_list' -> the chosen area must be on the active list; its fee_override
 *                  (if any) replaces the restaurant's delivery_fee.
 *   'none'      -> refused.
 * `lenient` (price-preview only): an area not chosen yet is priced at the
 * restaurant's own fee instead of failing; the real order is still checked.
 */
export function staffDeliveryCheck(
  isDelivery: boolean,
  settings: BillSettingsRow & { delivery_mode?: string | null },
  areaInput: string | null | undefined,
  areas: DeliveryAreaRow[],
  lenient = false,
): StaffDeliveryResult {
  const mode = deliveryModeOf(settings.delivery_mode);
  if (!isDelivery || mode === "postcode") return { ok: true, settings, area: null };
  const decision = decideDelivery(mode, { area: areaInput }, areas, settings.delivery_fee);
  if (!decision.ok) {
    if (lenient) return { ok: true, settings, area: null };
    return { ok: false, error: DELIVERY_REFUSAL_ERROR[decision.reason] };
  }
  return { ok: true, settings: { ...settings, delivery_fee: decision.fee }, area: decision.area };
}
