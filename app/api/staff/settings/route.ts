import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/staff-auth";
import { parseSettings } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";

// Owner action: save one section of the restaurant's Settings.
// Body: { section: "profile" | "money" | "orders" | "theme", values: { ... } }
//   - Capability settings_edit (lib/permissions.ts: owner only; manager and staff get 403). The restaurant comes from the login.
//   - Every value is checked (lib/settings.ts); anything unknown is refused.
//     currency and timezone are read-only: sending them is a 400.
//   - The save and its settings_audit row are written by ONE database function
//     (update_restaurant_settings_tx, migration 0019) in one transaction: if the
//     audit row cannot be written the setting is not saved either, and the other
//     way round. A save that changes nothing writes nothing.

const fail = (error: string, status: number, details?: string[]) =>
  NextResponse.json({ success: false, error, ...(details ? { details } : {}) }, { status });

export async function POST(request: Request) {
  const auth = await requireCapability(request, "settings_edit");
  if (!auth.ok) return auth.response;
  const { restaurantId: rid, staffId } = auth.staff;

  // The money limits depend on the restaurant's currency (read-only; one lookup by id).
  const cur = await supabaseAdmin.from("restaurants").select("currency").eq("id", rid).maybeSingle();
  if (cur.error || !cur.data) {
    console.error("settings: could not read the restaurant currency", cur.error);
    return fail("could not load settings", 500);
  }
  const parsed = parseSettings(await request.json().catch(() => null), cur.data.currency);
  if (!parsed.ok) return fail("invalid settings", 400, parsed.errors);
  const { section, values } = parsed.data;

  const { data, error } = await supabaseAdmin.rpc("update_restaurant_settings_tx", {
    p_restaurant_id: rid,
    p_staff_id: staffId,
    p_section: section,
    p_values: values,
  });
  if (error || !data) {
    console.error("settings: the save failed (nothing was saved)", error);
    return fail("could not save settings", 500);
  }
  const result = data as { ok: boolean; error?: string; changed?: string[] };
  if (!result.ok) {
    if (result.error === "not_allowed") return fail("forbidden", 403);
    if (result.error === "not_found") return fail("restaurant not found", 404);
    return fail("invalid settings", 400, [result.error ?? "unknown"]);
  }
  return NextResponse.json({ success: true, changed: result.changed ?? [] });
}
