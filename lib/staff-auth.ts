import { NextResponse } from "next/server";
import { SESSION_COOKIE, hasRole, verifySession, type StaffRole, type StaffSession } from "@/lib/session";
import { confirmStaffActive } from "@/lib/staff-active";
import { can, type Capability } from "@/lib/permissions";

// Login check for /api/staff/* routes. These are for restaurant staff using
// the dashboard, so they use the staff login cookie (lib/session.ts), NOT the
// x-tool-secret header, which belongs to the voice agent (lib/auth.ts).
// proxy.ts checks the cookie too; each route checks again for itself.
//
// THE TENANCY RULE: the restaurant always comes from the login session. A
// restaurant_id in the request body is never used; if one is sent and it is a
// different restaurant, the request is refused (403).

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** The logged-in staff member for this request, or null. Also checks the account is still active (lib/staff-active.ts). */
export async function getStaffFromRequest(request: Request): Promise<StaffSession | null> {
  const session = verifySession(readCookie(request, SESSION_COOKIE));
  return session ? confirmStaffActive(session) : null;
}

export type StaffCheck = { ok: true; staff: StaffSession } | { ok: false; response: NextResponse };

const forbidden = (error = "forbidden") => NextResponse.json({ success: false, error }, { status: 403 });

/**
 * Call first in every staff route:
 *   const auth = await requireStaff(request);
 *   if (!auth.ok) return auth.response;
 *   const rid = auth.staff.restaurantId;
 * No valid login, the account was switched off, or an old session_version -> 401.
 * `{ role: "owner" }` -> a login below that role gets 403 (prefer requireCapability).
 * A login that must still change its password gets 403 "password_change_required"
 * everywhere except routes that pass `allowPasswordChange: true` (the password route).
 */
export async function requireStaff(
  request: Request,
  options: { role?: StaffRole; allowPasswordChange?: boolean } = {},
): Promise<StaffCheck> {
  const staff = await getStaffFromRequest(request);
  if (!staff) return { ok: false, response: NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 }) };
  if (staff.mustChangePassword && !options.allowPasswordChange) return { ok: false, response: forbidden("password_change_required") };
  if (options.role && !hasRole(staff, options.role)) return { ok: false, response: forbidden() };
  return { ok: true, staff };
}

/** requireStaff plus one capability from lib/permissions.ts: not allowed -> 403. */
export async function requireCapability(request: Request, capability: Capability): Promise<StaffCheck> {
  const auth = await requireStaff(request);
  if (!auth.ok) return auth;
  if (!can(auth.staff.role, capability)) return { ok: false, response: forbidden() };
  return auth;
}

/**
 * Older dashboard tabs still send restaurant_id in the body. The same id as the
 * session is fine; a different one is refused (403). Returns null when allowed.
 */
export function restaurantMismatch(bodyRestaurantId: string | null | undefined, staff: StaffSession): NextResponse | null {
  if (bodyRestaurantId == null || bodyRestaurantId.toLowerCase() === staff.restaurantId.toLowerCase()) return null;
  return NextResponse.json({ success: false, error: "this login belongs to a different restaurant" }, { status: 403 });
}
