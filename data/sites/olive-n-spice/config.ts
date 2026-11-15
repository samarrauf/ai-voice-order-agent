// =====================================================================
// Olive 'n Spice: site settings
// ---------------------------------------------------------------------
// Everything that may change later lives in this ONE file. The pages read
// from here, so updating a value here updates the whole website.
//
// RULE: if we do not know something yet, leave it as `null`. The website
// then shows "To be confirmed" / "Coming soon" by itself. Never type a
// made-up phone number, address or opening time here.
// =====================================================================

/** A photo for one of the picture frames on the site. Files go in `public/brand/olive-n-spice/`. */
export type SitePhoto = {
  /** Path starting with "/", e.g. "/brand/olive-n-spice/interior.webp". */
  src: string;
  /** One short sentence describing the photo (read aloud by screen readers). */
  alt: string;
};

export type SiteConfig = {
  name: string;
  tagline: string;
  /** Shown small as "by Golden Palm". */
  parentGroup: string;
  /** One-line description used for Google / link previews. */
  description: string;
  cuisines: string[];

  /** Words shown on the pages (kept here so wording changes need no code change). */
  content: {
    /** The restaurant in one sentence (Home, "about" section). */
    about: string;
    events: {
      heading: string;
      /** The kinds of events hosted. */
      occasions: string[];
      promise: string;
    };
  };

  /** Where every page of this site lives. */
  basePath: string;
  /** The final public address, e.g. "https://www.example.com". `null` until a domain is chosen. */
  siteUrl: string | null;

  brand: {
    /** Path to the real logo file once we have it, e.g. "/brand/olive-n-spice/logo.svg". `null` = show the text wordmark. */
    logoSrc: string | null;
    /** Width / height of the logo file in pixels (only needed when logoSrc is set). */
    logoWidth: number;
    logoHeight: number;
  };

  contact: {
    /** Phone in international format, e.g. "+92 300 1234567". */
    phone: string | null;
    /** WhatsApp number in international format, e.g. "+92 300 1234567". */
    whatsapp: string | null;
    email: string | null;
  };

  location: {
    /** Street address lines. `null` until the client confirms it. */
    streetAddress: string | null;
    city: string;
    country: string;
    /** Two-letter country code (used in the search-engine data). */
    countryCode: string;
    /** A Google Maps "embed" link for the map box on the Reserve page. */
    mapEmbedUrl: string | null;
    /** A normal Google Maps link for the "Get directions" button. */
    mapLinkUrl: string | null;
  };

  /** Opening hours, one row per line, e.g. { days: "Monday to Sunday", hours: "12:00 pm to 12:00 am" }. `null` until confirmed. */
  openingHours: { days: string; hours: string }[] | null;

  social: {
    facebook: { handle: string; url: string } | null;
    instagram: { handle: string; url: string } | null;
  };

  /** Real photos. Every slot is optional: an empty slot shows an illustrated panel instead. */
  photos: {
    interior: SitePhoto | null;
    courtyard: SitePhoto | null;
    events: SitePhoto | null;
    gallery: SitePhoto[];
  };

  seo: {
    /**
     * THE SWITCH. `false` tells Google and other search engines NOT to list the
     * site (robots: noindex, nofollow). Change to `true` once the client has
     * approved the website.
     */
    allowIndexing: boolean;
  };
};

export const site: SiteConfig = {
  name: "Olive 'n Spice",
  tagline: "The art of fine dining",
  parentGroup: "Golden Palm",
  description:
    "Olive 'n Spice, Sargodha. Authentic Chinese, Continental, Fast Food and Desi cuisine with warm vibes inside and a serene courtyard.",
  cuisines: ["Chinese", "Continental", "Fast Food", "Desi"],

  content: {
    about: "Authentic Chinese, Continental, Fast Food & Desi with warm vibes inside & serene courtyard.",
    events: {
      heading: "Celebrate your special events with us",
      occasions: ["Corporate gathering", "Birthday", "Bridal shower", "Anniversary"],
      // Wording exactly as supplied by the restaurant.
      promise: "We make every get-together memorable and every celebration a more special.",
    },
  },

  basePath: "/olive-n-spice",
  siteUrl: null,

  brand: {
    logoSrc: null,
    logoWidth: 220,
    logoHeight: 64,
  },

  contact: {
    phone: null,
    whatsapp: null,
    email: null,
  },

  location: {
    streetAddress: null,
    city: "Sargodha",
    country: "Pakistan",
    countryCode: "PK",
    mapEmbedUrl: null,
    mapLinkUrl: null,
  },

  openingHours: null,

  social: {
    facebook: { handle: "Olivenspice", url: "https://www.facebook.com/Olivenspice" },
    instagram: { handle: "Olivenspice_", url: "https://www.instagram.com/Olivenspice_" },
  },

  photos: {
    interior: null,
    courtyard: null,
    events: null,
    gallery: [],
  },

  seo: {
    allowIndexing: false,
  },
};

// ---------------------------------------------------------------------
// Small helpers built from the settings above.
// ---------------------------------------------------------------------

/** Page addresses, so no page has to type "/olive-n-spice/..." by hand. */
export const routes = {
  home: site.basePath,
  menu: `${site.basePath}/menu`,
  events: `${site.basePath}/events`,
  reserve: `${site.basePath}/reserve`,
} as const;

/** Link to one section of the menu page, e.g. menuAnchor("pizza") -> "/olive-n-spice/menu#pizza". */
export function menuAnchor(sectionId: string): string {
  return `${routes.menu}#${sectionId}`;
}

/** "tel:" link for the call button, or null when there is no phone number yet. */
export function phoneHref(): string | null {
  const digits = site.contact.phone?.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

/** WhatsApp chat link, or null when there is no WhatsApp number yet. */
export function whatsappHref(message?: string): string | null {
  const digits = site.contact.whatsapp?.replace(/\D/g, "");
  if (!digits) return null;
  return message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;
}

/** "Sargodha, Pakistan" */
export const cityLine = `${site.location.city}, ${site.location.country}`;
