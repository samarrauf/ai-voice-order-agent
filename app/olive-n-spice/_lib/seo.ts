import type { Metadata } from "next";
import { routes, site } from "@/data/sites/olive-n-spice/config";
import { SITE_HOST, siteHref } from "@/lib/hosts";

// Search-engine helpers. Two rules:
//   1. Only say what we actually know (no made-up phone, address or hours).
//   2. While `seo.allowIndexing` in the config is false, every page tells
//      search engines "noindex, nofollow".

const robots: Metadata["robots"] = site.seo.allowIndexing
  ? { index: true, follow: true }
  : { index: false, follow: false, googleBot: { index: false, follow: false } };

/** The address visitors see on the website's own domain: "/olive-n-spice/menu" -> "/menu". */
const cleanPath = (path: string) => siteHref(path, SITE_HOST);

/** Title, description, Open Graph (link preview) and robots for one page. */
export function pageMetadata(page: { title?: string; description: string; path: string }): Metadata {
  const fullTitle = page.title ? `${page.title} | ${site.name}` : `${site.name} | ${site.tagline}`;
  const path = cleanPath(page.path);
  return {
    title: { absolute: fullTitle },
    description: page.description,
    ...(site.siteUrl ? { metadataBase: new URL(site.siteUrl), alternates: { canonical: path } } : {}),
    openGraph: {
      type: "website",
      siteName: site.name,
      title: fullTitle,
      description: page.description,
      locale: "en_PK",
      ...(site.siteUrl ? { url: path } : {}),
    },
    twitter: { card: "summary", title: fullTitle, description: page.description },
    robots,
  };
}

/** schema.org "Restaurant" data, built only from fields that are filled in. */
export function restaurantJsonLd(): Record<string, unknown> {
  const { contact, location, social, openingHours } = site;
  const sameAs = [social.facebook?.url, social.instagram?.url].filter(Boolean);

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: site.name,
    slogan: site.tagline,
    description: site.description,
    servesCuisine: site.cuisines,
    parentOrganization: { "@type": "Organization", name: site.parentGroup },
    address: {
      "@type": "PostalAddress",
      ...(location.streetAddress ? { streetAddress: location.streetAddress } : {}),
      addressLocality: location.city,
      addressCountry: location.countryCode,
    },
  };

  if (sameAs.length > 0) data.sameAs = sameAs;
  if (contact.phone) data.telephone = contact.phone.international;
  if (contact.email) data.email = contact.email;
  if (location.mapLinkUrl) data.hasMap = location.mapLinkUrl;
  if (openingHours) {
    // Open all day is written as 00:00 to 23:59, the form Google asks for.
    data.openingHoursSpecification = openingHours.map((row) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: row.schema.dayOfWeek,
      opens: row.schema.opens,
      closes: row.schema.closes,
    }));
  }
  if (site.siteUrl) {
    data.url = `${site.siteUrl}${cleanPath(routes.home)}`;
    data.hasMenu = `${site.siteUrl}${cleanPath(routes.menu)}`;
    data.acceptsReservations = `${site.siteUrl}${cleanPath(routes.reserve)}`;
  }
  return data;
}
