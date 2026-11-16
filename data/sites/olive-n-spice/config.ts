import { SITE_ORIGIN } from "@/lib/hosts";

// =====================================================================
// Olive 'n Spice: site settings
// ---------------------------------------------------------------------
// Everything that may change later lives in this ONE file. The pages read
// from here, so updating a value here updates the whole website.
//
// RULE: if we do not know something yet, leave it as `null`. The website
// then shows "To be confirmed" / "Coming soon" by itself. Never type a
// made-up phone number, address or opening time here.
//
// STILL TO CONFIRM WITH THE CLIENT (search this file for "CONFIRM"):
//   1. WhatsApp: is number par WhatsApp chalta hai?
//   2. Opening hours: kya waqai har din "Open 24 hours" hai?
//   3. Address: lafzi pata (street address) abhi nahi mila.
// =====================================================================

/** A photo for one of the picture frames on the site. Files go in `public/brand/olive-n-spice/`. */
export type SitePhoto = {
  /** Path starting with "/", e.g. "/brand/olive-n-spice/interior.webp". */
  src: string;
  /** One short sentence describing the photo (read aloud by screen readers). */
  alt: string;
};

/**
 * A phone number written two ways:
 *   display       = how guests read it on the page, e.g. "0313 7179700"
 *   international = the same number with the country code and no spaces,
 *                   e.g. "+923137179700". Used for the call / WhatsApp links.
 */
export type PhoneNumber = { display: string; international: string };

/** Day names in the spelling search engines expect. */
export type DayName = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

export const ALL_DAYS: DayName[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** One line of opening hours. */
export type OpeningHoursRow = {
  /** Shown on the page, e.g. "Every day". */
  days: string;
  /** Shown on the page, e.g. "Open 24 hours" or "12:00 pm to 12:00 am". */
  hours: string;
  /** The same thing for search engines, in 24-hour time. Open all day = opens "00:00", closes "23:59". */
  schema: { dayOfWeek: DayName[]; opens: string; closes: string };
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
  /** The final public address. `null` = none chosen yet. */
  siteUrl: string | null;

  brand: {
    /** Path to the real logo file once we have it, e.g. "/brand/olive-n-spice/logo.svg". `null` = show the text wordmark. */
    logoSrc: string | null;
    /** Width / height of the logo file in pixels (only needed when logoSrc is set). */
    logoWidth: number;
    logoHeight: number;
  };

  contact: {
    /** The number guests call. `null` = show "Coming soon". */
    phone: PhoneNumber | null;
    /** The WhatsApp number. `null` = show "Coming soon". */
    whatsapp: PhoneNumber | null;
    email: string | null;
  };

  location: {
    /** Street address lines. `null` until the client confirms it. */
    streetAddress: string | null;
    city: string;
    country: string;
    /** Two-letter country code (used in the search-engine data). */
    countryCode: string;
    /**
     * A Google Maps "embed" link (starts with https://www.google.com/maps/embed?...).
     * Only this long kind can be shown inside the map box. A short
     * maps.app.goo.gl link does NOT work there, so leave this `null` to show
     * the "Get directions" card instead.
     */
    mapEmbedUrl: string | null;
    /** A normal Google Maps link (short links are fine) for the "Get directions" buttons. */
    mapLinkUrl: string | null;
  };

  /** Opening hours, one row per line. `null` until we know them. */
  openingHours: OpeningHoursRow[] | null;

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
  // The website lives on this domain (see lib/hosts.ts). Canonical links, link previews and search-engine data use its clean paths: "/menu", not "/olive-n-spice/menu".
  siteUrl: SITE_ORIGIN,

  brand: {
    logoSrc: null,
    logoWidth: 220,
    logoHeight: 64,
  },

  contact: {
    phone: { display: "0313 7179700", international: "+923137179700" },
    // CONFIRM (client se confirm karna): is number par WhatsApp chalta hai?
    // Agar nahi chalta to is line ko `whatsapp: null,` kar dein; button khud "coming soon" ho jayega.
    whatsapp: { display: "0313 7179700", international: "+923137179700" },
    email: null,
  },

  location: {
    // CONFIRM (client se confirm karna): lafzi pata abhi nahi mila, is liye `null`
    // (site par "To be confirmed" dikhta hai). "Get directions" ka button phir bhi chalta hai.
    streetAddress: null,
    city: "Sargodha",
    country: "Pakistan",
    countryCode: "PK",
    // Chhota maps.app.goo.gl link map ke dabbay mein embed nahi hota, is liye yeh `null` hai.
    mapEmbedUrl: null,
    mapLinkUrl: "https://maps.app.goo.gl/DXenHmWjrwygyLz6A",
  },

  // CONFIRM (client se confirm karna): kya restaurant waqai har din 24 ghante khula hai?
  openingHours: [
    {
      days: "Every day",
      hours: "Open 24 hours",
      schema: { dayOfWeek: ALL_DAYS, opens: "00:00", closes: "23:59" },
    },
  ],

  social: {
    facebook: { handle: "theolivenspice", url: "https://www.facebook.com/theolivenspice/" },
    instagram: { handle: "olivenspice_", url: "https://www.instagram.com/olivenspice_/" },
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

/** "tel:" link for the call buttons (e.g. "tel:+923137179700"), or null when there is no phone number yet. */
export function phoneHref(): string | null {
  const digits = site.contact.phone?.international.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

/** WhatsApp chat link (e.g. "https://wa.me/923137179700"), or null when there is no WhatsApp number yet. */
export function whatsappHref(message?: string): string | null {
  const digits = site.contact.whatsapp?.international.replace(/\D/g, "");
  if (!digits) return null;
  return message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;
}

/** One short line of opening hours for tight spots, e.g. "Open 24 hours". Null when unknown or when there are several rows. */
export const hoursSummary: string | null = site.openingHours?.length === 1 ? site.openingHours[0].hours : null;

/** "Sargodha, Pakistan" */
export const cityLine = `${site.location.city}, ${site.location.country}`;
