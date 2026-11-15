import { restaurantJsonLd } from "../_lib/seo";

// Invisible block of "structured data" that tells Google this is a
// restaurant (name, cuisine, city, social pages). The `<` replacement is the
// safety step recommended by the Next.js docs for JSON-LD.
export function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurantJsonLd()).replace(/</g, "\\u003c") }}
    />
  );
}
