import { describe, expect, it } from "vitest";
import { POS_HOST, SITE_HOST, normalizeHost, routeForHost, siteHref, toSitePath } from "@/lib/hosts";

const OLD_HOST = "ai-voice-order-agent.vercel.app";

describe("normalizeHost", () => {
  it("lower-cases and drops the port", () => {
    expect(normalizeHost("Olive-N-Spice.Vercel.App")).toBe(SITE_HOST);
    expect(normalizeHost("localhost:3000")).toBe("localhost");
    expect(normalizeHost(`${SITE_HOST}:3000`)).toBe(SITE_HOST);
  });
  it("copes with a missing host", () => {
    expect(normalizeHost(null)).toBe("");
    expect(normalizeHost(undefined)).toBe("");
  });
});

describe("website host (olive-n-spice.vercel.app)", () => {
  const route = (path: string, host = SITE_HOST) => routeForHost(host, path);

  it("rewrites / to the website's home, keeping the address bar", () => {
    expect(route("/")).toEqual({ action: "rewrite", pathname: "/olive-n-spice", noindex: false });
  });
  it("rewrites /menu, /events and /reserve into /olive-n-spice/...", () => {
    expect(route("/menu")).toMatchObject({ action: "rewrite", pathname: "/olive-n-spice/menu" });
    expect(route("/events")).toMatchObject({ action: "rewrite", pathname: "/olive-n-spice/events" });
    expect(route("/reserve")).toMatchObject({ action: "rewrite", pathname: "/olive-n-spice/reserve" });
  });
  it("redirects the long /olive-n-spice addresses to the clean ones", () => {
    expect(route("/olive-n-spice/menu")).toMatchObject({ action: "redirect", pathname: "/menu" });
    expect(route("/olive-n-spice/reserve")).toMatchObject({ action: "redirect", pathname: "/reserve" });
    expect(route("/olive-n-spice")).toMatchObject({ action: "redirect", pathname: "/" });
    expect(route("/olive-n-spice/")).toMatchObject({ action: "redirect", pathname: "/" });
  });
  it("does not mistake a similar name for the website folder", () => {
    expect(route("/olive-n-spice-extra")).toMatchObject({ action: "rewrite", pathname: "/olive-n-spice/olive-n-spice-extra" });
  });
  it("shows 404 for the POS", () => {
    expect(route("/dashboard").action).toBe("notFound");
    expect(route("/dashboard/pos").action).toBe("notFound");
    expect(route("/dashboard/login").action).toBe("notFound");
    expect(route("/api/staff/seat-table").action).toBe("notFound");
    expect(route("/api/staff").action).toBe("notFound");
  });
  it("leaves Next.js internals and files alone", () => {
    expect(route("/_next/static/chunks/app.js").action).toBe("none");
    expect(route("/_next/image").action).toBe("none");
    expect(route("/favicon.ico").action).toBe("none");
    expect(route("/robots.txt").action).toBe("none");
    expect(route("/sitemap.xml").action).toBe("none");
    expect(route("/brand/olive-n-spice/hero/starters-1.webp").action).toBe("none");
  });
  it("leaves the other API routes alone", () => {
    expect(route("/api/tools/search-menu").action).toBe("none");
    expect(route("/api/orders").action).toBe("none");
    expect(route("/api/menu").action).toBe("none");
  });
  it("ignores the case of the host and a port", () => {
    expect(route("/menu", "OLIVE-N-SPICE.vercel.app").action).toBe("rewrite");
    expect(route("/menu", `${SITE_HOST}:443`).action).toBe("rewrite");
  });
  it("never asks for noindex (indexing is controlled by seo.allowIndexing)", () => {
    for (const path of ["/", "/menu", "/dashboard", "/olive-n-spice/menu", "/favicon.ico"]) {
      expect(route(path).noindex).toBe(false);
    }
  });
});

describe("POS host (olive-n-spice-pos.vercel.app)", () => {
  const route = (path: string, host = POS_HOST) => routeForHost(host, path);

  it("redirects / to /dashboard", () => {
    expect(route("/")).toEqual({ action: "redirect", pathname: "/dashboard", noindex: true });
  });
  it("shows 404 for the website", () => {
    expect(route("/olive-n-spice").action).toBe("notFound");
    expect(route("/olive-n-spice/menu").action).toBe("notFound");
  });
  it("leaves the dashboard (and its login check) and staff APIs alone", () => {
    expect(route("/dashboard").action).toBe("none");
    expect(route("/dashboard/pos").action).toBe("none");
    expect(route("/dashboard/login").action).toBe("none");
    expect(route("/api/staff/seat-table").action).toBe("none");
    expect(route("/api/tools/search-menu").action).toBe("none");
  });
  it("asks for noindex on every answer, even redirects and 404s", () => {
    for (const path of ["/", "/dashboard", "/dashboard/login", "/olive-n-spice", "/api/staff/seat-table", "/_next/static/x.js"]) {
      expect(route(path).noindex).toBe(true);
    }
  });
  it("ignores the case of the host and a port", () => {
    expect(route("/", "Olive-N-Spice-POS.vercel.app:8080").action).toBe("redirect");
  });
});

describe("every other host is left exactly as before", () => {
  const hosts = [OLD_HOST, "localhost:3000", "localhost", "127.0.0.1:3100", "ai-voice-order-agent-git-feature-x.vercel.app", "", null];
  const paths = ["/", "/menu", "/dashboard", "/dashboard/pos", "/olive-n-spice", "/olive-n-spice/menu", "/api/staff/seat-table", "/_next/static/a.js", "/favicon.ico"];

  it("does nothing, for any path, and never asks for noindex", () => {
    for (const host of hosts) {
      for (const path of paths) {
        expect(routeForHost(host, path), `${host} ${path}`).toEqual({ action: "none", noindex: false });
      }
    }
  });
  it("does not treat a look-alike domain as ours", () => {
    expect(routeForHost(`evil-${SITE_HOST}`, "/menu").action).toBe("none");
    expect(routeForHost(`${SITE_HOST}.evil.com`, "/menu").action).toBe("none");
    expect(routeForHost(`evil-${POS_HOST}`, "/").action).toBe("none");
  });
});

describe("siteHref (links inside the website)", () => {
  it("gives the clean path on the website's domain", () => {
    expect(siteHref("/olive-n-spice", SITE_HOST)).toBe("/");
    expect(siteHref("/olive-n-spice/menu", SITE_HOST)).toBe("/menu");
    expect(siteHref("/olive-n-spice/menu#pizza", SITE_HOST)).toBe("/menu#pizza");
    expect(siteHref("/olive-n-spice#about", SITE_HOST)).toBe("/#about");
    expect(siteHref("/olive-n-spice/reserve?x=1", `${SITE_HOST}:443`)).toBe("/reserve?x=1");
  });
  it("keeps the full path on every other host", () => {
    for (const host of [OLD_HOST, "localhost:3000", POS_HOST, "", null, undefined]) {
      expect(siteHref("/olive-n-spice/menu#pizza", host)).toBe("/olive-n-spice/menu#pizza");
      expect(siteHref("/olive-n-spice", host)).toBe("/olive-n-spice");
    }
  });
  it("leaves other kinds of link alone", () => {
    expect(siteHref("#content", SITE_HOST)).toBe("#content");
    expect(siteHref("/dashboard", SITE_HOST)).toBe("/dashboard");
    expect(siteHref("/olive-n-spice-extra", SITE_HOST)).toBe("/olive-n-spice-extra");
  });
});

describe("toSitePath", () => {
  it("turns the clean address-bar path back into the app's path", () => {
    expect(toSitePath("/")).toBe("/olive-n-spice");
    expect(toSitePath("/menu")).toBe("/olive-n-spice/menu");
  });
  it("leaves the full path as it is", () => {
    expect(toSitePath("/olive-n-spice")).toBe("/olive-n-spice");
    expect(toSitePath("/olive-n-spice/events")).toBe("/olive-n-spice/events");
  });
});
