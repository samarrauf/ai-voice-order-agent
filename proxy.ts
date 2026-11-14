import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/dashboard-auth";

// Next.js 16 calls this file "proxy" (it used to be "middleware"). It runs
// before every /dashboard page and sends visitors without a valid login
// cookie to the login page.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/dashboard/login") return NextResponse.next();

  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/dashboard/login", request.url));
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};
