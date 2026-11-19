import { z } from "zod";
import { DEFAULT_CURRENCY, maxDeliveryFeeFor, maxMinOrderFor } from "@/lib/money";

// The rules for every field on the owner's Settings page. Pure checks, no
// database here, so the page, the API route and the tests all share them.
//
// Four sections, each saved on its own:
//   profile  - name, contact details, address, receipt footer
//   money    - delivery fee, minimum order, tax, service charge, max discount
//   orders   - the "taking orders" switch
//   theme    - the five dashboard colours
// Unknown fields are refused (strict), so nobody can slip in `id` or `restaurant_id`.
// currency, timezone and rounding_step are READ-ONLY: the page shows them, nothing
// here (or in the database function update_restaurant_settings_tx) can ever change them.
// The biggest delivery fee and minimum order come from the restaurant's currency
// (lib/money.ts), so a rupee restaurant can save 150 / 1500; GBP is still 100 / 1000.

export const SECTIONS = ["profile", "money", "orders", "theme"] as const;
export type SettingsSection = (typeof SECTIONS)[number];

/** Shown on the Settings page but never changeable from it. */
export const READ_ONLY_COLUMNS = ["currency", "timezone", "rounding_step"] as const;

/** Every restaurants column the Settings page may read (the changeable ones plus the read-only ones). */
export const SETTINGS_COLUMNS = [
  "name", "tagline", "parent_group_name", "phone", "whatsapp_number", "address_line", "city", "postcode",
  "website_url", "instagram_handle", "facebook_url", "receipt_footer_note",
  ...READ_ONLY_COLUMNS,
  "delivery_fee", "min_order_value", "tax_rate_percent", "service_charge_percent",
  "service_charge_applies_to", "max_discount_percent",
  "is_accepting_orders",
  "theme_primary", "theme_accent", "theme_secondary", "theme_background", "theme_text",
] as const;
export type SettingsColumn = (typeof SETTINGS_COLUMNS)[number];

export const SERVICE_CHARGE_APPLIES_TO = ["none", "dine_in", "all"] as const;

// ---- field helpers ----

/** Optional text: blank becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null))
    .refine((v) => v === null || v.length <= max, { message: `at most ${max} characters` });

const requiredText = (max: number) => z.string().trim().min(1, "required").max(max, `at most ${max} characters`);

const webUrl = optionalText(200).refine(
  (v) => {
    if (v === null) return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  },
  { message: "must be a full web address starting with https://" },
);

const phone = optionalText(20).refine((v) => v === null || /^[0-9+()\-\s]{6,20}$/.test(v), {
  message: "digits, spaces, + ( ) and - only",
});

const instagram = optionalText(31)
  .refine((v) => v === null || /^@?[A-Za-z0-9._]{1,30}$/.test(v), { message: "letters, numbers, . and _ only" })
  .transform((v) => (v === null ? null : v.startsWith("@") ? v : `@${v}`));

const postcode = optionalText(10).refine((v) => v === null || /^[A-Za-z0-9 ]{3,10}$/.test(v), { message: "not a valid postcode" });

/** A number from 0 to `max`, rounded to 2 decimals. */
const amount = (max: number) =>
  z
    .number({ error: "must be a number" })
    .finite()
    .min(0, "cannot be negative")
    .max(max, `at most ${max}`)
    .transform((v) => Math.round(v * 100) / 100);

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "must look like #1E293B")
  .transform((v) => v.toUpperCase());

/** The money section for one currency: the biggest delivery fee and minimum order come from lib/money.ts. */
const moneySchema = (currency: string) =>
  z.strictObject({
    delivery_fee: amount(maxDeliveryFeeFor(currency)),
    min_order_value: amount(maxMinOrderFor(currency)),
    tax_rate_percent: amount(100),
    service_charge_percent: amount(100),
    service_charge_applies_to: z.enum(SERVICE_CHARGE_APPLIES_TO),
    max_discount_percent: amount(100),
  });

export const sectionSchemas = {
  profile: z.strictObject({
    name: requiredText(80),
    tagline: optionalText(120),
    parent_group_name: optionalText(80),
    phone,
    whatsapp_number: phone,
    address_line: optionalText(120),
    city: optionalText(60),
    postcode,
    website_url: webUrl,
    instagram_handle: instagram,
    facebook_url: webUrl,
    receipt_footer_note: optionalText(200),
  }),
  money: moneySchema(DEFAULT_CURRENCY), // the default-currency version; parseSettings uses the restaurant's own
  orders: z.strictObject({
    is_accepting_orders: z.boolean(),
  }),
  theme: z.strictObject({
    theme_primary: hex,
    theme_accent: hex,
    theme_secondary: hex,
    theme_background: hex,
    theme_text: hex,
  }),
} satisfies Record<SettingsSection, z.ZodType>;

export type ParsedSettings = { section: SettingsSection; values: Record<string, unknown> };

/**
 * Checks `{ section, values }` from a request. Returns the cleaned values or a list of "field: problem" messages.
 * `currency` is the restaurant's own currency code (it sets the money limits); missing means the default (GBP).
 */
export function parseSettings(input: unknown, currency: string = DEFAULT_CURRENCY): { ok: true; data: ParsedSettings } | { ok: false; errors: string[] } {
  const body = input as { section?: unknown; values?: unknown } | null;
  const section = body?.section;
  if (typeof section !== "string" || !(SECTIONS as readonly string[]).includes(section)) {
    return { ok: false, errors: ["section: must be one of " + SECTIONS.join(", ")] };
  }
  // Read-only fields get a clear message instead of the generic "unrecognised key".
  if (body?.values && typeof body.values === "object") {
    for (const field of READ_ONLY_COLUMNS) {
      if (field in body.values) return { ok: false, errors: [`${field}: read-only, it cannot be changed from Settings`] };
    }
  }
  const schema = section === "money" ? moneySchema(currency) : sectionSchemas[section as SettingsSection];
  const parsed = schema.safeParse(body?.values);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "values"}: ${i.message}`) };
  }
  return { ok: true, data: { section: section as SettingsSection, values: parsed.data as Record<string, unknown> } };
}

export type FieldChange = { from: unknown; to: unknown };

const same = (a: unknown, b: unknown) => {
  // Numbers come back from the database as numbers or numeric strings; compare as numbers.
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return (a ?? null) === (b ?? null);
};

/** Only the fields whose value really changed: { field: { from, to } }. Empty object = nothing to save. */
export function diffSettings(current: Record<string, unknown>, next: Record<string, unknown>): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  for (const [key, to] of Object.entries(next)) {
    const from = current[key] ?? null;
    if (!same(from, to)) changes[key] = { from, to };
  }
  return changes;
}
