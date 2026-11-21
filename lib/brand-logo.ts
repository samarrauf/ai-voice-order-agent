// The logo in the dashboard top bar: the restaurant's own logo_url, or (for
// Olive 'n Spice, while the column is still empty) the logo file shipped in
// /public, or else the first letter of the name.

export const OLIVE_LOGO_PATH = "/brand/olive-n-spice-logo.png";

export type TopBarLogo = { src: string | null; initial: string };

function safeSrc(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (s.startsWith("/") && !s.startsWith("//") && !s.includes("\\")) return s;
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : null;
}

export function topBarLogo(name: string, logoUrl: unknown): TopBarLogo {
  const clean = (name ?? "").trim();
  const src = safeSrc(logoUrl) ?? (/olive/i.test(clean) ? OLIVE_LOGO_PATH : null);
  return { src, initial: (clean.charAt(0) || "?").toUpperCase() };
}
