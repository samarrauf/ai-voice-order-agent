import { describe, expect, it } from "vitest";
import { LITE_INIT_SCRIPT, LITE_STORAGE_KEY, decideLite } from "@/lib/lite-mode";

const base = { stored: null, cores: 8, prefersReducedMotion: false };

describe("decideLite", () => {
  it("is off on a normal device with no choice", () => {
    expect(decideLite(base)).toBe(false);
  });
  it("is on for weak devices (4 cores or fewer)", () => {
    expect(decideLite({ ...base, cores: 4 })).toBe(true);
    expect(decideLite({ ...base, cores: 2 })).toBe(true);
    expect(decideLite({ ...base, cores: 5 })).toBe(false);
  });
  it("is on when reduced motion is requested", () => {
    expect(decideLite({ ...base, prefersReducedMotion: true })).toBe(true);
  });
  it("unknown core count (0 or missing) does not switch it on by itself", () => {
    expect(decideLite({ ...base, cores: undefined })).toBe(false);
    expect(decideLite({ ...base, cores: 0 })).toBe(false);
  });
  it("the user's own choice always wins", () => {
    expect(decideLite({ stored: "0", cores: 2, prefersReducedMotion: true })).toBe(false);
    expect(decideLite({ stored: "1", cores: 16, prefersReducedMotion: false })).toBe(true);
  });
  it("junk in storage is ignored (falls back to the device rule)", () => {
    expect(decideLite({ ...base, stored: "yes" })).toBe(false);
    expect(decideLite({ stored: "yes", cores: 2, prefersReducedMotion: false })).toBe(true);
  });
});

// The inline script repeats the rule without a bundle; run it against fake browser globals to keep both in sync.
function runScript(opts: { stored: string | null; cores: number | undefined; reduced: boolean; storageThrows?: boolean }) {
  const attrs: Record<string, string> = {};
  const fakeWindow = { matchMedia: () => ({ matches: opts.reduced }) };
  const fakeLocalStorage = {
    getItem: (k: string) => {
      if (opts.storageThrows) throw new Error("blocked");
      return k === LITE_STORAGE_KEY ? opts.stored : null;
    },
  };
  const fakeDocument = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
  new Function("window", "localStorage", "navigator", "document", LITE_INIT_SCRIPT)(
    fakeWindow,
    fakeLocalStorage,
    { hardwareConcurrency: opts.cores },
    fakeDocument,
  );
  return "data-lite" in attrs;
}

describe("LITE_INIT_SCRIPT (runs before first paint)", () => {
  it("agrees with decideLite for every combination", () => {
    for (const stored of [null, "0", "1", "junk"])
      for (const cores of [undefined, 2, 4, 8])
        for (const reduced of [false, true])
          expect(runScript({ stored, cores, reduced }), JSON.stringify({ stored, cores, reduced })).toBe(
            decideLite({ stored, cores, prefersReducedMotion: reduced }),
          );
  });
  it("survives blocked storage (uses the device rule)", () => {
    expect(runScript({ stored: "1", cores: 2, reduced: false, storageThrows: true })).toBe(true);
    expect(runScript({ stored: "1", cores: 8, reduced: false, storageThrows: true })).toBe(false);
  });
});
