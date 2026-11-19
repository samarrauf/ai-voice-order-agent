import { NextResponse } from "next/server";
import { SESSION_COOKIE, hasRole, verifySession, type StaffRole, type StaffSession } from "@/lib/session";
import { confirmStaffActive } from "@/lib/staff-active";

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

/**
 * Call first in every staff route:
 *   const auth = await requireStaff(request);
 *   if (!auth.ok) return auth.response;
 *   const rid = auth.staff.restaurantId;
 * No valid login, or the account was switched off -> 401. `{ role: "owner" }` -> a staff (non-owner) login gets 403.
 */
export async function requireStaff(request: Request, options: { role?: StaffRole } = {}): Promise<StaffCheck> {
  const staff = await getStaffFromRequest(request);
  if (!staff) return { ok: false, response: NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 }) };
  if (options.role && !hasRole(staff, options.role)) {
    return { ok: false, response: NextResponse.json({ success: false, error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, staff };
}

/**
 * Older dashboard tabs still send restaurant_id in the body. The same id as the
 * session is fine; a different one is refused (403). Returns null when allowed.
 */
export function restaurantMismatch(bodyRestaurantId: string | null | undefined, staff: StaffSession): NextResponse | null {
  if (bodyRestaurantId == null || bodyRestaurantId.toLowerCase() === staff.restaurantId.toLowerCase()) return null;
  return NextResponse.json({ success: false, error: "this login belongs to a different restaurant" }, { status: 403 });
}
