import { NextResponse } from "next/server";

/**
 * Next.js 16 route guard (formerly middleware.js).
 * Only checks that the refresh cookie exists — the API still verifies every request.
 */
const PROTECTED = ["/dashboard"];
const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];
const REFRESH_COOKIE = "rt";
const ADMIN_COOKIE = "prt";

export function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(REFRESH_COOKIE);

  // Super admin panel has its own session cookie.
  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && !request.cookies.has(ADMIN_COOKIE)) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  if (PROTECTED.some((p) => pathname.startsWith(p)) && !hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if (AUTH_PAGES.includes(pathname) && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup", "/forgot-password", "/admin/:path*"],
};
