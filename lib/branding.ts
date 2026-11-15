import { supabaseAdmin } from "@/lib/supabase/server";

// A restaurant's look: name, optional "by <group>" line and five hex colours.
// Lives in the `restaurants` table (migration 0010). If the columns are missing
// or the query fails we fall back to the defaults, so the dashboard never breaks.

export type Branding = {
  name: string;
  tagline: string | null;
  parentGroupName: string | null;
  primary: string;
  accent: string;
  secondary: string;
  background: string;
  text: string;
};

export const DEFAULT_BRANDING: Branding = {
  name: "Restaurant",
  tagline: null,
  parentGroupName: null,
  primary: "#1E293B",
  accent: "#3B82F6",
  secondary: "#64748B",
  background: "#FFFFFF",
  text: "#1A1A1A",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Only a strict #RRGGBB passes; anything else becomes the fallback (these values go into a style attribute). */
export function sanitizeHex(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value.trim()) ? value.trim() : fallback;
}

/** Black or white, whichever is easier to read on top of `hex`. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return luminance > 0.4 ? "#111111" : "#FFFFFF";
}

const cleanText = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Turns a raw database row into a safe Branding object. */
export function brandingFromRow(row: Record<string, unknown> | null | undefined): Branding {
  const d = DEFAULT_BRANDING;
  if (!row) return d;
  return {
    name: cleanText(row.name) ?? d.name,
    tagline: cleanText(row.tagline),
    parentGroupName: cleanText(row.parent_group_name),
    primary: sanitizeHex(row.theme_primary, d.primary),
    accent: sanitizeHex(row.theme_accent, d.accent),
    secondary: sanitizeHex(row.theme_secondary, d.secondary),
    background: sanitizeHex(row.theme_background, d.background),
    text: sanitizeHex(row.theme_text, d.text),
  };
}

export async function getBranding(restaurantId: string): Promise<Branding> {
  const { data, error } = await supabaseAdmin.from("restaurants").select("*").eq("id", restaurantId).maybeSingle();
  if (error) {
    console.error("dashboard: failed to load branding", error);
    return DEFAULT_BRANDING;
  }
  return brandingFromRow(data);
}
