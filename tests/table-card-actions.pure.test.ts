import { describe, expect, it } from "vitest";
import { STAFF_ROLES, can } from "@/lib/permissions";
import { printBillHref } from "@/lib/print-links";
import { busyTableActions, owedPence, posTableHref, readyToClear, tableForPos, unpaidOrders } from "@/lib/tables";

// Network-free: the rules behind the buttons on a busy table card.

const order = (id: string, total: number, paidAmount = 0) => ({ id, total, paidAmount });
const both = { canPay: true, canPrint: true };

describe("owed amount", () => {
  it("is total minus paid in whole pence, never negative", () => {
    expect(owedPence(order("a", 18.5, 0))).toBe(1850);
    expect(owedPence(order("a", 18.5, 5.1))).toBe(1340);
    expect(owedPence(order("a", 0.3, 0.1))).toBe(20); // no float drift (0.3 - 0.1)
    expect(owedPence(order("a", 10, 12))).toBe(0);
  });
  it("unpaidOrders keeps only orders that still owe money", () => {
    const list = [order("a", 10, 10), order("b", 10, 4), order("c", 10)];
    expect(unpaidOrders(list).map((o) => o.id)).toEqual(["b", "c"]);
  });
});

describe("Clear table only after payment", () => {
  it("is not ready with nothing paid or part paid", () => {
    expect(readyToClear([order("a", 10)])).toBe(false);
    expect(readyToClear([order("a", 10, 9.99)])).toBe(false);
  });
  it("is ready once every order is fully paid", () => {
    expect(readyToClear([order("a", 10, 10)])).toBe(true);
    expect(readyToClear([order("a", 10, 10), order("b", 4.5, 4.5)])).toBe(true);
  });
  it("is not ready while one of two orders is still unpaid", () => {
    expect(readyToClear([order("a", 10, 10), order("b", 4.5, 1)])).toBe(false);
  });
  it("a table with no orders is not 'ready' (the card offers plain Clear for it separately)", () => {
    expect(readyToClear([])).toBe(false);
  });
});

describe("busy table buttons", () => {
  it("unpaid table: add items, pay and print, clear not ready", () => {
    expect(busyTableActions([order("a", 10)], both)).toEqual({ addItems: true, pay: true, printBill: true, clearReady: false });
  });
  it("fully paid table: no pay button, print stays, clear is ready", () => {
    expect(busyTableActions([order("a", 10, 10)], both)).toEqual({ addItems: true, pay: false, printBill: true, clearReady: true });
  });
  it("a role without take_payment never gets the pay button", () => {
    expect(busyTableActions([order("a", 10)], { canPay: false, canPrint: true }).pay).toBe(false);
  });
  it("a role without print_bill never gets the print button", () => {
    expect(busyTableActions([order("a", 10)], { canPay: true, canPrint: false }).printBill).toBe(false);
  });
  it("seated table with no order yet: only add items", () => {
    expect(busyTableActions([], both)).toEqual({ addItems: true, pay: false, printBill: false, clearReady: false });
  });
});

describe("capabilities used by the card", () => {
  it("take_payment and print_bill are the existing capabilities, open to every staff role", () => {
    for (const role of STAFF_ROLES) {
      expect(can(role, "take_payment")).toBe(true);
      expect(can(role, "print_bill")).toBe(true);
    }
    expect(can(null, "take_payment")).toBe(false);
    expect(can(undefined, "print_bill")).toBe(false);
  });
});

describe("links", () => {
  it("Items jodo opens the POS on that table (id encoded)", () => {
    expect(posTableHref("abc-123")).toBe("/dashboard/pos?table=abc-123");
    expect(posTableHref("a&b=c")).toBe("/dashboard/pos?table=a%26b%3Dc");
  });
  it("Bill print uses the existing print page", () => {
    expect(printBillHref("o1")).toBe("/dashboard/print/bill/o1");
  });
});

describe("POS ?table= preselect", () => {
  const tables = [
    { id: "t1", number: "1", sessionId: "s1" },
    { id: "t2", number: "2", sessionId: null },
  ];
  it("selects a table that has an open session", () => {
    expect(tableForPos(tables, "t1")).toEqual({ tableId: "t1", tableNumber: "1", sessionId: "s1" });
  });
  it("ignores a free table, an unknown id and a missing param", () => {
    expect(tableForPos(tables, "t2")).toBeNull();
    expect(tableForPos(tables, "nope")).toBeNull();
    expect(tableForPos(tables, undefined)).toBeNull();
  });
});
