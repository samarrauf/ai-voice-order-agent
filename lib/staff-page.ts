import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { confirmStaffActive } from "@/lib/staff-active";
import { SESSION_COOKIE, hasRole, verifySession, type StaffRole, type StaffSession } from "@/lib/session";

// The same login check as lib/staff-auth.ts, for dashboard PAGES (server
// components). Pages read the restaurant from here, never from a constant.

/** The logged-in staff member, or null (used by the layout to choose login frame vs dashboard). */
// Also checks the account is still active (lib/staff-active.ts), so switching
// an account off logs it out on its next page load. cache() = one lookup per
// page render even though the layout and the page both ask.
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const session = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  return session ? confirmStaffActive(session) : null;
});

/** The logged-in staff member. No valid login -> back to the login page. */
export async function requireStaffPage(options: { role?: StaffRole } = {}): Promise<StaffSession> {
  const staff = await getStaffSession();
  if (!staff) redirect("/dashboard/login");
  if (options.role && !hasRole(staff, options.role)) redirect("/dashboard");
  return staff;
}
