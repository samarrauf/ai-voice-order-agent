import { Suspense } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/dashboard-auth";
import { logout } from "./actions";
import { NavLinks } from "./nav-links";

// Shared frame for every /dashboard page: a top bar with the nav links and a
// logout button. The colour comes from --accent-color (app/globals.css).
// The login page lives under /dashboard too, so when nobody is logged in we
// skip the bar and show the page on its own.
async function Shell({ children }: { children: React.ReactNode }) {
  const loggedIn = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!loggedIn) return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 bg-accent px-4 py-2 text-accent-contrast">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Napoli POS</span>
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
