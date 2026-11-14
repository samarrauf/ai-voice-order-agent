import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/dashboard-auth";

// Login check for /api/staff/* routes. These are for restaurant staff using
// the dashboard, so they use the dashboard login cookie — NOT the x-tool-secret
// header, which belongs to the voice agent (lib/auth.ts). The two never mix.
// (proxy.ts only guards /dashboard pages, so each staff route checks for itself.)

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/**
 * Returns null if the request carries a valid dashboard login cookie, or a
 * 401 response to return as-is. Call it first in every staff route.
 */
export function requireDashboardSession(request: Request): NextResponse | null {
  if (verifySessionToken(readCookie(request, SESSION_COOKIE))) return null;
  return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
}
