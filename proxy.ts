import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/dashboard-auth";
import { routeForHost } from "@/lib/hosts";

// Next.js 16 calls this file "proxy" (it used to be "middleware"). It does
// two jobs, in this order:
//   1. Domain routing (lib/hosts.ts): olive-n-spice.vercel.app shows only the
//      website, olive-n-spice-pos.vercel.app shows only the POS. Every other
//      host (the old domain, localhost, previews) is left exactly as it was.
//   2. The /dashboard login check: visitors without a valid login cookie are
//      sent to the login page. (This part is unchanged.)

const NOINDEX = "noindex, nofollow";

/** The login check for /dashboard pages: same rules as before the domain routing was added. */
function guardDashboard(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (pathname === "/dashboard/login") return NextResponse.next();

  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/dashboard/login", request.url));
}

const isDashboardPath = (pathname: string) => pathname === "/dashboard" || pathname.startsWith("/dashboard/");

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const route = routeForHost(request.headers.get("host"), pathname);

  let response: NextResponse;
  switch (route.action) {
    case "rewrite": {
      const url = request.nextUrl.clone();
      url.pathname = route.pathname;
      response = NextResponse.rewrite(url);
      break;
    }
    case "redirect": {
      const url = request.nextUrl.clone();
      url.pathname = route.pathname;
      response = NextResponse.redirect(url, route.pathname === "/dashboard" ? 307 : 308);
      break;
    }
    case "notFound": {
      // A path that does not exist, so the visitor gets the normal 404 page.
      const url = request.nextUrl.clone();
      url.pathname = "/_host-not-found";
      response = NextResponse.rewrite(url, { status: 404 });
      break;
    }
    default:
      response = isDashboardPath(pathname) ? guardDashboard(request) : NextResponse.next();
  }

  if (route.noindex) response.headers.set("X-Robots-Tag", NOINDEX);
  return response;
}

export const config = {
  // Everything except Next.js internals, files (anything with a dot in its name:
  // images, favicon, robots.txt...) and API routes. /api/staff is kept in, because
  // the website's domain has to answer 404 for it.
  matcher: ["/((?!_next/|api/(?!staff(?:/|$))|.*\\..*).*)"],
};
