// =====================================================================
// Which website lives on which domain
// ---------------------------------------------------------------------
// One project, three things inside it. Two of them have their own domain:
//
//   SITE_HOST  olive-n-spice.vercel.app      -> ONLY the Olive 'n Spice website
//   POS_HOST   olive-n-spice-pos.vercel.app  -> ONLY the POS (/dashboard)
//   anything else (the old ai-voice-order-agent.vercel.app, localhost,
//   preview deployments) -> works exactly as before: both /olive-n-spice
//   and /dashboard are reachable.
//
// This file has no Next.js code in it, only plain functions, so proxy.ts
// (which does the real redirecting) and the tests can both use it.
// =====================================================================

export const SITE_HOST = "olive-n-spice.vercel.app";
export const POS_HOST = "olive-n-spice-pos.vercel.app";

/** The website's real folder inside the app. On SITE_HOST the visitor never sees it in the address bar. */
export const SITE_BASE_PATH = "/olive-n-spice";

/** The website's public address (used for canonical links and search-engine data). */
export const SITE_ORIGIN = `https://${SITE_HOST}`;

/** "Olive-N-Spice.vercel.app:3000" -> "olive-n-spice.vercel.app" (lower case, no port). */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export type HostRoute =
  /** Leave the request alone (the normal login check for /dashboard still runs afterwards). */
  | { action: "none"; noindex: boolean }
  /** Show another path's page, but keep the address bar as it is. */
  | { action: "rewrite"; pathname: string; noindex: boolean }
  /** Send the visitor to another path. */
  | { action: "redirect"; pathname: string; noindex: boolean }
  /** Show a 404 page. */
  | { action: "notFound"; noindex: boolean };

const isUnder = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Files and Next.js internals: never touched, whatever the domain. */
function isStaticPath(pathname: string): boolean {
  if (isUnder(pathname, "/_next")) return true;
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  return lastSegment.includes("."); // favicon.ico, robots.txt, /brand/olive-n-spice/hero.webp ...
}

/**
 * Decide what to do with one request, from its host and path alone.
 * `host` is the raw Host header (the port is allowed and ignored).
 */
export function routeForHost(host: string | null | undefined, pathname: string): HostRoute {
  const name = normalizeHost(host);

  if (name === SITE_HOST) {
    if (isStaticPath(pathname)) return { action: "none", noindex: false };
    // The POS must not open on the website's domain.
    if (isUnder(pathname, "/dashboard") || isUnder(pathname, "/api/staff")) return { action: "notFound", noindex: false };
    // Every other API route (the voice agent's tools, orders...) is not ours to touch.
    if (isUnder(pathname, "/api")) return { action: "none", noindex: false };
    // The long address is for the old domain. Here, keep the address bar clean.
    if (isUnder(pathname, SITE_BASE_PATH)) {
      return { action: "redirect", pathname: pathname.slice(SITE_BASE_PATH.length) || "/", noindex: false };
    }
    return { action: "rewrite", pathname: pathname === "/" ? SITE_BASE_PATH : `${SITE_BASE_PATH}${pathname}`, noindex: false };
  }

  if (name === POS_HOST) {
    // The POS shows Napoli's demo data for now (separate logins come later), so it must stay out of search engines.
    if (isStaticPath(pathname)) return { action: "none", noindex: true };
    if (pathname === "/") return { action: "redirect", pathname: "/dashboard", noindex: true };
    if (isUnder(pathname, SITE_BASE_PATH)) return { action: "notFound", noindex: true };
    return { action: "none", noindex: true };
  }

  return { action: "none", noindex: false };
}

/**
 * The address to put in a website link. `path` is the full path inside the app
 * (e.g. "/olive-n-spice/menu#pizza"). On SITE_HOST that becomes the clean
 * "/menu#pizza"; on any other host it is returned unchanged.
 */
export function siteHref(path: string, host?: string | null): string {
  if (normalizeHost(host) !== SITE_HOST) return path;
  const cut = path.search(/[?#]/);
  const base = cut === -1 ? path : path.slice(0, cut);
  const rest = cut === -1 ? "" : path.slice(cut);
  if (!isUnder(base, SITE_BASE_PATH)) return path;
  return `${base.slice(SITE_BASE_PATH.length) || "/"}${rest}`;
}

/**
 * The browser may report the address bar's path ("/menu" on SITE_HOST) instead of
 * the app's own path ("/olive-n-spice/menu"). This always gives the app's path,
 * so "which page am I on?" checks work on every domain.
 */
export function toSitePath(pathname: string): string {
  if (isUnder(pathname, SITE_BASE_PATH)) return pathname;
  return pathname === "/" ? SITE_BASE_PATH : `${SITE_BASE_PATH}${pathname}`;
}
