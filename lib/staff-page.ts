import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can, type Capability } from "@/lib/permissions";
import { confirmStaffActive } from "@/lib/staff-active";
import { SESSION_COOKIE, hasRole, verifySession, type StaffRole, type StaffSession } from "@/lib/session";

// The same login check as lib/staff-auth.ts, for dashboard PAGES (server
// components). Pages read the restaurant from here, never from a constant.

export const PASSWORD_PAGE = "/dashboard/password";

/** The logged-in staff member, or null (used by the layout to choose login frame vs dashboard). */
// Also checks the account is still active and the cookie's session_version is
// current (lib/staff-active.ts), so switching an account off or resetting its
// password logs it out on its next page load. cache() = one lookup per
// page render even though the layout and the page both ask.
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const session = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  return session ? confirmStaffActive(session) : null;
});

/**
 * The logged-in staff member. No valid login -> back to the login page.
 * A login that must change its password first -> the password page (unless this IS that page).
 */
export async function requireStaffPage(options: { role?: StaffRole; allowPasswordChange?: boolean } = {}): Promise<StaffSession> {
  const staff = await getStaffSession();
  if (!staff) redirect("/dashboard/login");
  if (staff.mustChangePassword && !options.allowPasswordChange) redirect(PASSWORD_PAGE);
  if (options.role && !hasRole(staff, options.role)) redirect("/dashboard");
  return staff;
}

/** requireStaffPage plus one capability from lib/permissions.ts: not allowed -> back to /dashboard. */
export async function requireCapabilityPage(capability: Capability): Promise<StaffSession> {
  const staff = await requireStaffPage();
  if (!can(staff.role, capability)) redirect("/dashboard");
  return staff;
}
