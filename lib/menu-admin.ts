import { z } from "zod";
import { maxAmountFor } from "@/lib/money";

// Menu editor rules (P7): validation for /api/staff/menu and the change log.
// Pure module (no server imports) so it is unit-testable without the network.

const guid = z.guid();

/** A price in the restaurant's currency: 0 or more, at most two decimals, under the currency's limit. */
export const priceSchema = (currency?: string | null) =>
  z
    .number("price must be a number")
    .finite()
    .min(0, "price cannot be negative")
    .max(maxAmountFor(currency), "price is too high")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "price can have at most two decimals");

const name = (max: number) => z.string().trim().min(1, "name is required").max(max, `name is too long (max ${max})`);

export const CATEGORY_NAME = name(80);
export const ITEM_NAME = name(80);
export const DESCRIPTION_MAX = 300;

export const PHOTO_MAX_BYTES = 1_500_000; // 1.5 MB (the bucket allows 1572864 as a second wall)
export const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const isPhotoType = (t: string): t is keyof typeof PHOTO_TYPES => Object.hasOwn(PHOTO_TYPES, t);

/** Aliases may arrive as "a, b, c" (a form field) or as a list. */
const aliasesSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(",")).map((a) => a.trim()).filter(Boolean))
  .pipe(z.array(z.string().max(40, "alias is too long")).max(20, "too many aliases"))
  .transform((list) => [...new Set(list.map((a) => a.toLowerCase()))]);

export function itemSchema(currency?: string | null) {
  const price = priceSchema(currency);
  return z
    .object({
      category_id: guid,
      name: ITEM_NAME,
      description: z.string().trim().max(DESCRIPTION_MAX, `description is too long (max ${DESCRIPTION_MAX})`).default(""),
      base_price: price,
      sizes: z
        .array(z.object({ name: name(40), price, is_default: z.boolean().default(false) }).strict())
        .max(10, "too many sizes")
        .default([]),
      options: z
        .array(
          z
            .object({
              group_name: name(40),
              name: name(60),
              price_delta: price,
              max_select: z.number().int().min(1).max(20).default(1),
            })
            .strict(),
        )
        .max(60, "too many extras")
        .default([]),
      is_vegetarian: z.boolean().default(false),
      spice_level: z.number().int().min(0).max(3).nullable().default(null),
      aliases: aliasesSchema.default([]),
      sort_order: z.number().int().min(0).max(100000).default(0),
      is_available: z.boolean().default(true),
    })
    .strict()
    .superRefine((v, ctx) => {
      if (v.sizes.length > 0) {
        if (v.sizes.filter((s) => s.is_default).length !== 1) {
          ctx.addIssue({ code: "custom", path: ["sizes"], message: "exactly one size must be the default" });
        }
        const names = v.sizes.map((s) => s.name.toLowerCase());
        if (new Set(names).size !== names.length) {
          ctx.addIssue({ code: "custom", path: ["sizes"], message: "two sizes have the same name" });
        }
      }
      const keys = v.options.map((o) => `${o.group_name.toLowerCase()}|${o.name.toLowerCase()}`);
      if (new Set(keys).size !== keys.length) {
        ctx.addIssue({ code: "custom", path: ["options"], message: "the same extra is listed twice" });
      }
    });
}
export type ItemInput = z.infer<ReturnType<typeof itemSchema>>;

/** The whole body of POST /api/staff/menu. restaurant_id may be sent (old tabs) but is only compared, never used. */
export function menuActionSchema(currency?: string | null) {
  const id = guid;
  const base = { restaurant_id: guid.optional() };
  return z.discriminatedUnion("action", [
    z.object({ ...base, action: z.literal("category_add"), name: CATEGORY_NAME }).strict(),
    z.object({ ...base, action: z.literal("category_rename"), id, name: CATEGORY_NAME }).strict(),
    z.object({ ...base, action: z.literal("category_move"), id, direction: z.enum(["up", "down"]) }).strict(),
    z.object({ ...base, action: z.literal("category_visibility"), id, visible: z.boolean() }).strict(),
    z.object({ ...base, action: z.literal("category_archive"), id }).strict(),
    z.object({ ...base, action: z.literal("item_save"), id: id.optional(), item: itemSchema(currency) }).strict(),
    z.object({ ...base, action: z.literal("item_availability"), id, available: z.boolean() }).strict(),
    z.object({ ...base, action: z.literal("item_archive"), id }).strict(),
    z.object({ ...base, action: z.literal("category_restore"), id }).strict(),
    z.object({ ...base, action: z.literal("item_restore"), id }).strict(),
  ]);
}
export type MenuAction = z.infer<ReturnType<typeof menuActionSchema>>;

export type Change = { field: string; old: string | null; new: string | null };

const text = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): string | null => (v === null || v === undefined ? null : Number(v).toFixed(2));

export type StoredItem = {
  category_id: string | null;
  name: string;
  description: string | null;
  base_price: number | string;
  is_available: boolean;
  is_vegetarian: boolean;
  spice_level: number | null;
  aliases: string[] | null;
  sort_order: number;
  sizes: { name: string; price: number | string; is_default: boolean }[];
  options: { group_name: string; name: string; price_delta: number | string; max_select: number }[];
};

const sizesText = (s: StoredItem["sizes"] | ItemInput["sizes"]) =>
  s.length === 0 ? null : s.map((x) => `${x.name}=${num(x.price)}${x.is_default ? "*" : ""}`).join("; ");
const optionsText = (o: StoredItem["options"] | ItemInput["options"]) =>
  o.length === 0 ? null : o.map((x) => `${x.group_name}/${x.name}=${num(x.price_delta)}x${x.max_select}`).join("; ");

/** Field-by-field difference between what is stored and what is being saved. old = null for a new item. */
export function diffItem(old: StoredItem | null, next: ItemInput): Change[] {
  const after: Record<string, string | null> = {
    category_id: text(next.category_id),
    name: next.name,
    description: next.description || null,
    base_price: num(next.base_price),
    is_available: text(next.is_available),
    is_vegetarian: text(next.is_vegetarian),
    spice_level: text(next.spice_level),
    aliases: next.aliases.length ? next.aliases.join(", ") : null,
    sort_order: text(next.sort_order),
    sizes: sizesText(next.sizes),
    extras: optionsText(next.options),
  };
  const before: Record<string, string | null> = old
    ? {
        category_id: text(old.category_id),
        name: old.name,
        description: old.description || null,
        base_price: num(old.base_price),
        is_available: text(old.is_available),
        is_vegetarian: text(old.is_vegetarian),
        spice_level: text(old.spice_level),
        aliases: old.aliases?.length ? old.aliases.join(", ") : null,
        sort_order: text(old.sort_order),
        sizes: sizesText(old.sizes),
        extras: optionsText(old.options),
      }
    : Object.fromEntries(Object.keys(after).map((k) => [k, null]));
  return Object.keys(after)
    .filter((f) => before[f] !== after[f])
    .map((f) => ({ field: f, old: before[f], new: after[f] }));
}
