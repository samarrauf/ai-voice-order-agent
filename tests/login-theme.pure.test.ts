import { describe, expect, it } from "vitest";
import { POS_HOST, SITE_HOST } from "@/lib/hosts";
import { NEUTRAL_LOGIN_THEME, OLIVE_LOGIN_THEME, loginThemeForHost } from "@/lib/login-theme";
import { isHex } from "@/lib/color";

describe("loginThemeForHost", () => {
  it("POS host = Olive 'n Spice", () => {
    expect(loginThemeForHost(POS_HOST)).toBe(OLIVE_LOGIN_THEME);
    expect(loginThemeForHost(`${POS_HOST.toUpperCase()}:443`)).toBe(OLIVE_LOGIN_THEME);
  });
  it("any other host (localhost, old domain, website host, missing) = neutral", () => {
    for (const h of ["localhost:3000", "ai-voice-order-agent.vercel.app", SITE_HOST, "", null, undefined]) {
      expect(loginThemeForHost(h)).toBe(NEUTRAL_LOGIN_THEME);
    }
  });
  it("neutral look has no name, no logo and is not blue", () => {
    expect(NEUTRAL_LOGIN_THEME.name).toBeNull();
    expect(NEUTRAL_LOGIN_THEME.logoSrc).toBeNull();
    expect(NEUTRAL_LOGIN_THEME.accent.toUpperCase()).not.toBe("#3B82F6");
  });
  it("exposes only name, logoSrc and the three theme colours (public fields), all well-formed", () => {
    for (const t of [OLIVE_LOGIN_THEME, NEUTRAL_LOGIN_THEME]) {
      expect(Object.keys(t).sort()).toEqual(["accent", "logoSrc", "name", "primary", "secondary"]);
      for (const c of [t.primary, t.secondary, t.accent]) expect(isHex(c)).toBe(true);
      if (t.logoSrc) expect(t.logoSrc).toMatch(/^\/brand\/[\w.-]+$/);
    }
  });
});

describe("Olive login theme colours", () => {
  it("are the saved Olive theme: green, sage, gold", () => {
    expect([OLIVE_LOGIN_THEME.primary, OLIVE_LOGIN_THEME.secondary, OLIVE_LOGIN_THEME.accent].map((c) => c.toUpperCase())).toEqual(["#556B3F", "#8FA377", "#C9A227"]);
  });
});
