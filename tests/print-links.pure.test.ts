import { describe, expect, it } from "vitest";
import { printBillHref, printKotHref } from "@/lib/print-links";

describe("print links", () => {
  const id = "3f2b8c1e-1111-4a2b-9c3d-0123456789ab";
  it("bill link uses the order id", () => {
    expect(printBillHref(id)).toBe(`/dashboard/print/bill/${id}`);
  });
  it("kot link uses the order id", () => {
    expect(printKotHref(id)).toBe(`/dashboard/print/kot/${id}`);
  });
  it("escapes odd characters in the id", () => {
    expect(printBillHref("a/b")).toBe("/dashboard/print/bill/a%2Fb");
  });
});
