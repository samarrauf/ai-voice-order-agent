import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BILL_UNPAID_ERROR, addableOrders, busyLabel } from "@/lib/tables";

// Network-free: the rules behind "add items to a running bill" (B4a2).

describe("busy table label", () => {
  it("shows the running bill and the minutes seated", () => {
    expect(busyLabel(42.5, 35, (n) => `£${n.toFixed(2)}`)).toBe("Busy · £42.50 · 35 min");
    expect(busyLabel(0, 75, (n) => `Rs ${n}`)).toBe("Busy · Rs 0 · 1 h 15 min");
  });
});

describe("addableOrders", () => {
  const o = (status: string, paidAmount = 0) => ({ status, paidAmount });
  it("keeps open, unpaid orders only", () => {
    const list = [o("new"), o("preparing"), o("ready"), o("accepted"), o("cancelled"), o("completed"), o("merged"), o("new", 5)];
    expect(addableOrders(list).map((x) => x.status)).toEqual(["new", "preparing", "ready", "accepted"]);
  });
  it("is empty when nothing can be added to", () => {
    expect(addableOrders([o("completed"), o("new", 1)])).toEqual([]);
    expect(addableOrders([])).toEqual([]);
  });
});

describe("the unpaid-clear message is a fixed marker", () => {
  it("is not the 'already cleared' text callers swallow", () => {
    expect(BILL_UNPAID_ERROR).toMatch(/unpaid/);
    expect(BILL_UNPAID_ERROR).not.toMatch(/already cleared/);
  });
  it("both screens that clear a table stop on it instead of treating 409 as 'already cleared'", () => {
    for (const file of ["app/dashboard/bookings/bookings-board.tsx", "app/dashboard/tables/tables-floor.tsx"]) {
      expect(readFileSync(file, "utf8"), file).toContain("BILL_UNPAID_ERROR");
    }
  });
});

describe("POS wiring (source level; the real screen needs a browser)", () => {
  const terminal = readFileSync("app/dashboard/pos/pos-terminal.tsx", "utf8");
  const dialogs = readFileSync("app/dashboard/pos/dialogs.tsx", "utf8");
  const tables = readFileSync("app/dashboard/tables/tables-floor.tsx", "utf8");
  it("a busy table opens the add / separate / other dialog instead of picking it straight away", () => {
    expect(dialogs).toContain("onPickBusy(t)");
    expect(dialogs).toContain("Add items to this bill");
    expect(dialogs).toContain("Start a separate bill");
    expect(dialogs).toContain("Choose another table");
    expect(dialogs).toContain("busyLabel(");
  });
  it("adding goes to /api/staff/add-items with ids and quantities only; the ?table= start defaults to the running bill", () => {
    expect(terminal).toContain("/api/staff/add-items");
    expect(terminal).toContain("addableOrders(t.busy.orders)[0]");
    expect(terminal).toContain("separate_from_order_id");
  });
  it("the Tables card has no 'Items jodo' button again", () => {
    expect(tables).not.toMatch(/Items jodo/);
    expect(tables).not.toContain("posTableHref");
  });
});
