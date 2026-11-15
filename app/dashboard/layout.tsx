import { Suspense } from "react";
import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { LogOut } from "lucide-react";
import { DEMO_RESTAURANT_ID } from "@/lib/agent/tools";
import { type Branding, getBranding, readableOn } from "@/lib/branding";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/dashboard-auth";
import { cn } from "@/components/ui";
import { logout } from "./actions";
import { BottomNav, MainTabs, SecondaryLinks } from "./nav-links";
import { NewOrderLink } from "./new-order-link";
import { Splash } from "./splash";
import { TodayDate } from "./today-date";

// Dashboard fonts: an elegant serif for headings, a modern sans for everything
// else. next/font downloads them at build time and serves them from our own site.
const displayFont = Fraunces({ subsets: ["latin"], variable: "--font-display-face" });
const uiFont = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-ui-face" });

// Shared frame for every /dashboard page: a slim header (restaurant badge, name,
// date, tabs, log out) and, on phones, a bottom navigation bar.
// The dashboard is always dark and neutral; only the accent comes from the
// restaurant's theme in the database (lib/branding.ts), set below as CSS
// variables on the wrapper. See the design tokens in app/globals.css.
// Every full page load also plays the splash screen (./splash.tsx).
// The login page lives under /dashboard too, so when nobody is logged in we
// skip the header and show the login frame instead (still themed, with the splash).
async function Shell({ children }: { children: React.ReactNode }) {
  const loggedIn = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  // One restaurant uses the dashboard for now (see CLAUDE.md "Dashboard auth"),
  // so the theme is Napoli's. The session cookie carries no restaurant id.
  const branding = await getBranding(DEMO_RESTAURANT_ID);

  const themeVars = {
    "--color-primary": branding.primary,
    "--color-accent": branding.accent,
    "--color-secondary": branding.secondary,
    "--color-on-accent": readableOn(branding.accent),
    "--splash-text": readableOn(branding.primary),
  } as CSSProperties;

  return (
    <div style={themeVars} className={cn("dash", displayFont.variable, uiFont.variable)}>
      <Splash branding={branding} />
      {loggedIn ? <Frame branding={branding}>{children}</Frame> : <LoginFrame branding={branding}>{children}</LoginFrame>}
    </div>
  );
}

/** Round badge with the restaurant's first letter. Stands in for the logo until a real one is added. */
function InitialBadge({ name, large }: { name: string; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-accent font-display font-semibold text-on-accent ring-1 ring-accent-line ring-offset-2 ring-offset-canvas",
        large ? "size-16 text-3xl" : "size-10 text-lg",
      )}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Frame({ branding, children }: { branding: Branding; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
        {/* Three parts on desktop: badge + name (left), tabs (exactly centred), links (right). */}
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:grid lg:h-20 lg:grid-cols-[1fr_auto_1fr]">
          <div className="flex min-w-0 items-center gap-3">
            <InitialBadge name={branding.name} />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold leading-tight">{branding.name}</p>
              <p className="truncate text-xs text-ink-faint"><TodayDate /></p>
            </div>
          </div>

          <div className="hidden lg:block">
            <MainTabs />
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2 lg:justify-self-end">
            <NewOrderLink compact />
            <SecondaryLinks />
            <form action={logout}>
              <button
                type="submit"
                aria-label="Log out"
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-line bg-raised px-3 text-sm font-semibold transition-colors duration-200 hover:border-line-strong sm:px-4"
              >
                <LogOut size={16} aria-hidden />
                {/* Icon only between lg and xl: the centred tabs leave no room for the words there. */}
                <span className="hidden whitespace-nowrap sm:inline lg:hidden xl:inline">Log out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Extra bottom padding below lg so the bottom navigation never covers content. */}
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:pb-12">{children}</main>
      <BottomNav />
    </div>
  );
}

/** What a logged-out visitor sees: the restaurant's name over a soft glow, with the login form below it. */
function LoginFrame({ branding, children }: { branding: Branding; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="login-glow" />
      <div className="anim-rise relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <InitialBadge name={branding.name} large />
          <p className="mt-5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{branding.name}</p>
          {branding.tagline && (
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-faint">{branding.tagline}</p>
          )}
        </div>
        {children}
        {branding.parentGroupName && (
          <p className="mt-6 text-center text-xs italic text-ink-faint">by {branding.parentGroupName}</p>
        )}
      </div>
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
