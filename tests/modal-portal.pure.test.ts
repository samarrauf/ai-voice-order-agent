import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Network-free, source-level guard. A real layout test needs a browser (not possible here).
// Bug: the Tables page draws cards with backdrop-filter, which makes `position: fixed` children
// position against the card, so the Take bill popup opened off-screen. The shared Modal must
// therefore render through a portal, above the top bar (z-30) and the nav (z-40).

const read = (p: string) => readFileSync(p, "utf8");
const modal = read("app/dashboard/pos/dialogs.tsx");

describe("shared Modal", () => {
  it("renders through createPortal into the .dash wrapper (theme colours live there)", () => {
    expect(modal).toContain('import { createPortal } from "react-dom"');
    expect(modal).toMatch(/return createPortal\(/);
    expect(modal).toContain('".dash"');
  });
  it("sits above the top bar and the nav", () => {
    const z = Number(/fixed inset-0 z-\[(\d+)\]/.exec(modal)?.[1]);
    expect(z).toBeGreaterThan(40);
  });
  it("locks the page scroll while open and restores it, and keeps Escape", () => {
    expect(modal).toContain("document.body.style.overflow");
    expect(modal).toContain("previous");
    expect(modal).toContain('"Escape"');
  });
  it("the backdrop click and the X still close it", () => {
    const frame = modal.slice(modal.indexOf("export function Modal"), modal.indexOf("export function ErrorNote"));
    expect(frame.match(/onClick=\{onClose\}/g)?.length).toBe(2);
  });
});

describe("every popup goes through the shared Modal", () => {
  it("no other file draws its own fixed full-screen overlay or dialog", () => {
    for (const f of [
      "app/dashboard/pos/payment-dialog.tsx",
      "app/dashboard/pos/held-dialogs.tsx",
      "app/dashboard/pos/pos-terminal.tsx",
      "app/dashboard/tables/tables-floor.tsx",
    ]) {
      const src = read(f);
      expect(src, f).not.toMatch(/fixed inset-0/);
      expect(src, f).not.toContain('role="dialog"');
    }
  });
  it("the Tables page payment popup uses the shared Modal (via PaymentDialog)", () => {
    expect(read("app/dashboard/pos/payment-dialog.tsx")).toContain("<Modal");
    expect(read("app/dashboard/tables/tables-floor.tsx")).toContain("<PaymentDialog");
  });
});

describe("Tables card buttons", () => {
  const floor = read("app/dashboard/tables/tables-floor.tsx");
  it("says Take bill, not Payment lo, and has no Items jodo button", () => {
    expect(floor).toContain("Take bill");
    expect(floor).not.toContain("Payment lo");
    expect(floor).not.toContain("Items jodo");
  });
});
