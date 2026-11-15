// =====================================================================
// Olive 'n Spice: home page hero (the interactive menu carousel)
// ---------------------------------------------------------------------
// One entry per slide, in the order they appear. Each slide shows one
// menu group from menu.ts with three dishes floating in the middle.
//
// REAL PHOTOS: every slide has an optional `images` list. Leave it out
// and the slide shows our illustrations. Add it and the photos replace
// the illustrations (left, centre, right), with no other code change:
//
//   images: [
//     { src: "/brand/olive-n-spice/hero/starters-1.webp", alt: "Bowl of hot and sour soup" },
//     { src: "/brand/olive-n-spice/hero/starters-2.webp", alt: "Loaded fries" },
//     { src: "/brand/olive-n-spice/hero/starters-3.webp", alt: "Peri peri wings" },
//   ],
//
// Photos should be cut-outs with a transparent background (PNG or WebP),
// roughly square. Use `null` for a position that should keep its drawing.
// =====================================================================

/** Names of the built-in illustrations (drawn in app/olive-n-spice/_components/food-art.tsx). */
export type HeroArt =
  | "fries" | "soup" | "wings"
  | "pasta" | "steak" | "cloche"
  | "wok" | "rice-bowl" | "noodle-box"
  | "pizza" | "burger" | "wrap"
  | "handi" | "skewers" | "naan"
  | "lava-cake" | "mint-drink" | "lime-drink";

export type HeroImage = { src: string; alt: string };

export type HeroSlide = {
  /** `id` of a group in menu.ts. */
  groupId: string;
  /** Is the background light or dark? Decides the text colour. */
  tone: "light" | "dark";
  /** Background colour of the whole hero while this slide is showing (a brand tone). */
  background: string;
  /** Illustrations: left, centre, right. */
  art: [HeroArt, HeroArt, HeroArt];
  /** Optional real photos: left, centre, right. */
  images?: [HeroImage | null, HeroImage | null, HeroImage | null];
};

export const heroSlides: HeroSlide[] = [
  { groupId: "starters", tone: "light", background: "#f7f1e2", art: ["soup", "fries", "wings"] },
  { groupId: "pasta-continental", tone: "light", background: "#e2e9d5", art: ["steak", "pasta", "cloche"] },
  { groupId: "chinese", tone: "dark", background: "#2f3d22", art: ["rice-bowl", "wok", "noodle-box"] },
  { groupId: "fast-food", tone: "light", background: "#f1e3b5", art: ["burger", "pizza", "wrap"] },
  { groupId: "mughlai-bbq", tone: "dark", background: "#43552f", art: ["skewers", "handi", "naan"] },
  { groupId: "desserts-drinks", tone: "light", background: "#f5ebd6", art: ["mint-drink", "lava-cake", "lime-drink"] },
];
