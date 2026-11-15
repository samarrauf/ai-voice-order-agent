import { Suspense } from "react";
import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { DEMO_RESTAURANT_ID } from "@/lib/agent/tools";
import { getBranding, readableOn } from "@/lib/branding";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/dashboard-auth";
import { logout } from "./actions";
import { NavLinks } from "./nav-links";
import { Splash } from "./splash";

// Shared frame for every /dashboard page: a top bar with the nav links and a
// logout button. Colours come from the restaurant's theme in the database
// (lib/branding.ts), set below as CSS variables on the wrapper element.
// Every full page load also plays the splash screen (./splash.tsx).
// The login page lives under /dashboard too, so when nobody is logged in we
// skip the bar and show the page on its own (still themed, with the splash).
async function Shell({ children }: { children: React.ReactNode }) {
  const loggedIn = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  // One restaurant uses the dashboard for now (see CLAUDE.md "Dashboard auth"),
  // so the theme is Napoli's. The session cookie carries no restaurant id.
  const branding = await getBranding(DEMO_RESTAURANT_ID);

  const themeVars = {
    "--color-primary": branding.primary,
    "--color-accent": branding.accent,
    "--color-secondary": branding.secondary,
    "--color-background": branding.background,
    "--color-text": branding.text,
    // Aliases so the existing Tailwind classes (bg-background, text-foreground, bg-accent...) follow the theme too.
    "--background": branding.background,
    "--foreground": branding.text,
    "--accent-color": branding.primary,
    "--accent-contrast": readableOn(branding.primary),
    "--splash-text": readableOn(branding.primary),
    background: branding.background,
    color: branding.text,
  } as CSSProperties;

  return (
    <div style={themeVars} className="min-h-screen">
      <Splash branding={branding} />
      {loggedIn ? <Frame name={branding.name}>{children}</Frame> : children}
    </div>
  );
}

function Frame({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 bg-accent px-4 py-2 text-accent-contrast">
        <div className="flex items-center gap-6">
          <span className="font-semibold">{name} POS</span>
          <NavLinks />
        </div>
        <form action={logout}>
          <button type="submit" className="rounded border border-white/40 px-3 py-1.5 text-sm hover:bg-white/10">
            Log out
          </button>
        </form>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
