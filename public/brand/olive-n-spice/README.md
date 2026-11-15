# Olive 'n Spice: brand files

This folder is the home for the restaurant's REAL logo and photos.
It is empty on purpose: the website currently shows a text wordmark and
original illustrations, and switches to real files as soon as they are
added here and named in `data/sites/olive-n-spice/config.ts`.

## Logo

1. Save the logo here, e.g. `logo.svg` (best) or `logo.png` (transparent background).
2. In `data/sites/olive-n-spice/config.ts` set:
   - `brand.logoSrc: "/brand/olive-n-spice/logo.svg"`
   - `brand.logoWidth` / `brand.logoHeight` to the file's size in pixels.

## Photos

| Where it shows                    | Config field                | Suggested file            |
| --------------------------------- | --------------------------- | ------------------------- |
| Home, "warm vibes inside" frame   | `photos.interior`           | `interior.webp`           |
| Home, "serene courtyard" frame    | `photos.courtyard`          | `courtyard.webp`          |
| Events page frame                 | `photos.events`             | `events.webp`             |
| Home gallery strip                | `photos.gallery` (a list)   | `gallery-1.webp`, ...     |
| Hero carousel dishes (3 per slide)| `data/sites/olive-n-spice/hero.ts` -> `images` | `hero/<group>-1.webp` ... |

Hero dish photos should be cut-outs with a transparent background
(PNG or WebP, roughly square, about 900 x 900 px).

Every photo needs a short `alt` sentence describing it.
