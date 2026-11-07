import { NextResponse } from "next/server";

/**
 * Next.js 16 route guard (formerly middleware.js).
 * Only checks that the refresh cookie exists — the API still verifies every request.
 */
const PROTECTED = ["/dashboard"];
const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];
const REFRESH_COOKIE = "rt";
const ADMIN_COOKIE = "prt";

/**
 * Customer portal on the ISP's subdomain: speednet.<ROOT_DOMAIN>/ → /portal/speednet.
 * Needs NEXT_PUBLIC_ROOT_DOMAIN (e.g. ispmanager.com.bd) plus a wildcard DNS record and certificate.
 */
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.toLowerCase();
const NOT_TENANT = new Set(["www", "app", "api", "admin", "portal", "mail", "status", "docs", "blog", "help", "support", "staging", "dev", "cdn", "static"]);

function portalRewrite(request) {
  if (!ROOT_DOMAIN) return null;
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const sub = host.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!sub || sub.includes(".") || NOT_TENANT.has(sub)) return null;

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/portal/") || pathname.startsWith("/pay/") || pathname.startsWith("/payment/")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/pay" ? `/pay/${sub}` : `/portal/${sub}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

/**
 * ISP's own domain (verified in Settings → Integrations): my.speednet.com.bd/ → /portal/speednet.
 * Our own hosts are listed in NEXT_PUBLIC_APP_HOSTS so they are never looked up.
 */
const APP_HOSTS = new Set((process.env.NEXT_PUBLIC_APP_HOSTS ?? "localhost,127.0.0.1").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";
const domainCache = new Map(); // host → { slug, at }

async function customDomainRewrite(request) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (!host || APP_HOSTS.has(host) || (ROOT_DOMAIN && (host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`)))) return null;
  let hit = domainCache.get(host);
  if (!hit || Date.now() - hit.at > 5 * 60_000) {
    try {
      const r = await fetch(`${API_URL}/public/domain/${encodeURIComponent(host)}`);
      hit = { slug: r.ok ? (await r.json()).data.slug : null, at: Date.now() };
    } catch {
      hit = { slug: null, at: Date.now() - 4 * 60_000 }; // API down: retry in a minute
    }
    domainCache.set(host, hit);
  }
  if (!hit.slug) return null;
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/portal/") || pathname.startsWith("/pay/") || pathname.startsWith("/payment/")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/pay" ? `/pay/${hit.slug}` : `/portal/${hit.slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export async function proxy(request) {
  const portal = portalRewrite(request) ?? (await customDomainRewrite(request));
  if (portal) return portal;

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
  // Everything except Next.js internals and static files (the subdomain rewrite needs "/" too).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
