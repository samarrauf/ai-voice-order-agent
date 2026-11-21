import { Suspense } from "react";
import type { CSSProperties } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { LockKeyhole } from "lucide-react";
import { DEFAULT_BRANDING, getBranding, readableOn } from "@/lib/branding";
import { resolveAccent } from "@/lib/color";
import { LITE_INIT_SCRIPT } from "@/lib/lite-mode";
import { getStaffSession } from "@/lib/staff-page";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cn } from "@/components/ui";
import { logout } from "./actions";
import { AppShell } from "./app-shell";
import { PasswordForm } from "./password/password-form";
import { Splash } from "./splash";

// One geometric, rounded sans for the whole dashboard (headings and text).
// next/font downloads it at build time and serves it from our own site.
// Print pages keep their own fonts: they are styled by print/print.css.
const uiFont = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-ui-face" });

// Shared frame for every /dashboard page: floating sidebar, top bar and, on
// phones, a bottom bar (app-shell.tsx; the links live in lib/nav.ts).
// The dashboard is always dark; only the accent comes from the restaurant's
// theme in the database (lib/branding.ts). lib/color.ts makes it safe: text on
// the accent always has AA contrast and a too-dark accent is lightened.
// Every full page load also plays the splash screen (./splash.tsx).
// The login page lives under /dashboard too, so when nobody is logged in we
// skip the shell and show a neutral login frame instead: before login we do
// not know the restaurant, so no restaurant name, theme or splash is shown.
// After login the restaurant (and so its theme) comes from the login session.

/** Name, time zone and "new orders waiting" for the shell, read in parallel. All of them fail soft. */
async function shellInfo(staff: { staffId: string; restaurantId: string }) {
  const [restaurant, account, pending] = await Promise.all([
    supabaseAdmin.from("restaurants").select("timezone").eq("id", staff.restaurantId).maybeSingle(),
    supabaseAdmin.from("staff_accounts").select("username").eq("id", staff.staffId).eq("restaurant_id", staff.restaurantId).maybeSingle(),
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", staff.restaurantId)
      .in("status", ["new", "accepted"]),
  ]);
  return {
    timeZone: restaurant.data?.timezone || "Europe/London",
    username: account.data?.username || "Staff",
    pendingOrders: pending.count ?? 0,
  };
}

async function Shell({ children }: { children: React.ReactNode }) {
  const staff = await getStaffSession();
  const [branding, info] = staff
    ? await Promise.all([getBranding(staff.restaurantId), shellInfo(staff)])
    : [DEFAULT_BRANDING, null];

  const accent = resolveAccent(branding.accent, DEFAULT_BRANDING.accent);
  const themeVars = {
    "--color-primary": branding.primary,
    "--color-accent": accent.accent,
    "--color-secondary": branding.secondary,
    "--color-on-accent": accent.onAccent,
    "--accent-ink": accent.ink,
    "--splash-text": readableOn(branding.primary),
  } as CSSProperties;

  return (
    <div style={themeVars} className={cn("dash", uiFont.variable)}>
      {staff?.mustChangePassword ? (
        // A new or reset account: only the password form (and log out) until a new password is chosen.
        // Every page shows it, whatever its URL; pages that load data also redirect here (requireStaffPage).
        <LoginFrame>
          <PasswordForm forced />
          <form action={logout} className="mt-4 text-center">
            <button type="submit" className="text-sm font-semibold text-ink-faint hover:text-ink">
              Log out
            </button>
          </form>
        </LoginFrame>
      ) : staff && info ? (
        <>
          <Splash branding={branding} />
          <AppShell
            restaurantName={branding.name}
            role={staff.role}
            username={info.username}
            timeZone={info.timeZone}
            pendingOrders={info.pendingOrders}
            logoutAction={logout}
          >
            {children}
          </AppShell>
        </>
      ) : (
        <LoginFrame>{children}</LoginFrame>
      )}
    </div>
  );
}

/** What a logged-out visitor sees: a neutral badge over the warm gradient, with the glass login card below it. */
function LoginFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="login-glow" />
      <div className="anim-rise relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span
            aria-hidden
            className="glass flex size-16 items-center justify-center rounded-full text-ink"
          >
            <LockKeyhole size={26} />
          </span>
          <p className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-4xl">Staff dashboard</p>
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-faint">Orders · Bookings · POS</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Runs before the first paint so Lite mode never flashes (lib/lite-mode.ts). */}
      <script dangerouslySetInnerHTML={{ __html: LITE_INIT_SCRIPT }} />
      <Suspense fallback={null}>
        <Shell>{children}</Shell>
      </Suspense>
    </>
  );
}
