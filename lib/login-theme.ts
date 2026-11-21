import { normalizeHost, POS_HOST } from "@/lib/hosts";

// What the login page may show BEFORE anybody is logged in. Only public things:
// the restaurant's name, its logo and one theme colour, picked from the host
// (lib/hosts.ts). It is a fixed table on purpose: the unauthenticated page never
// reads the database, so it cannot leak anything that is not listed here.
// An unknown host (localhost, previews, the old domain) gets the neutral look.

export type LoginTheme = {
  name: string | null;
  /** Public path under /public, or null. */
  logoSrc: string | null;
  /** #RRGGBB, run through resolveAccent() before use. */
  accent: string;
};

export const NEUTRAL_LOGIN_THEME: LoginTheme = { name: null, logoSrc: null, accent: "#D4D4D8" };

// Gold of the Olive 'n Spice logo (the logo's main colour); same family as the saved theme_accent.
export const OLIVE_LOGIN_THEME: LoginTheme = {
  name: "Olive 'n Spice",
  logoSrc: "/brand/olive-n-spice-logo.png",
  accent: "#C9A227",
};

export function loginThemeForHost(host: string | null | undefined): LoginTheme {
  return normalizeHost(host) === POS_HOST ? OLIVE_LOGIN_THEME : NEUTRAL_LOGIN_THEME;
}
