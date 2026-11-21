import { describe, expect, it } from "vitest";
import { NAV_ITEMS, isNavActive, navFor, pageTitleFor } from "@/lib/nav";
import { STAFF_ROLES } from "@/lib/permissions";

const ids = (role: Parameters<typeof navFor>[0]) => navFor(role).map((i) => i.id);

describe("navFor (role filter via can())", () => {
  it("staff do not see Settings or Staff", () => {
    expect(ids("staff")).not.toContain("settings");
    expect(ids("staff")).not.toContain("staff");
  });
  it("manager does not see Settings or Staff either (owner-only capabilities)", () => {
    expect(ids("manager")).not.toContain("settings");
    expect(ids("manager")).not.toContain("staff");
  });
  it("owner sees everything", () => {
    expect(ids("owner")).toEqual(NAV_ITEMS.map((i) => i.id));
  });
  it("every role sees the everyday pages", () => {
    for (const role of STAFF_ROLES) {
      expect(ids(role)).toEqual(expect.arrayContaining(["orders", "overview", "bookings", "calls", "customers", "tables", "menu"]));
    }
  });
  it("no role (logged out / unknown) never sees the owner-only items", () => {
    expect(ids(null)).not.toContain("settings");
    expect(ids(undefined)).not.toContain("staff");
  });
  it("can be limited to the main or foot group", () => {
    expect(navFor("owner", "foot").map((i) => i.id)).toEqual(["staff", "settings"]);
    expect(navFor("staff", "foot")).toEqual([]);
  });
  it("ids and routes are unique and every route is under /dashboard", () => {
    expect(new Set(NAV_ITEMS.map((i) => i.id)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map((i) => i.href)).size).toBe(NAV_ITEMS.length);
    for (const i of NAV_ITEMS) expect(i.href.startsWith("/dashboard")).toBe(true);
  });
});

describe("active item and page title", () => {
  const orders = NAV_ITEMS.find((i) => i.id === "orders")!;
  it("Orders is active only on its exact path", () => {
    expect(isNavActive("/dashboard", orders)).toBe(true);
    expect(isNavActive("/dashboard/bookings", orders)).toBe(false);
  });
  it("other items are active on sub paths too", () => {
    const bookings = NAV_ITEMS.find((i) => i.id === "bookings")!;
    expect(isNavActive("/dashboard/bookings", bookings)).toBe(true);
    expect(isNavActive("/dashboard/bookings/x", bookings)).toBe(true);
    expect(isNavActive("/dashboard/bookingsX", bookings)).toBe(false);
  });
  it("page titles", () => {
    expect(pageTitleFor("/dashboard")).toBe("Orders");
    expect(pageTitleFor("/dashboard/settings")).toBe("Settings");
    expect(pageTitleFor("/dashboard/pos")).toBe("New order");
    expect(pageTitleFor("/dashboard/password")).toBe("Password");
    expect(pageTitleFor("/dashboard/nowhere")).toBe("Dashboard");
  });
});
