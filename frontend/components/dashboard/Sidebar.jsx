"use client";

import { Lock } from "lucide-react";
import sidebarSections from "@/app/constant/dashboard/sidebar";
import { useAuth } from "@/providers/AuthProvider";

const UPGRADE = "/dashboard/billing/subscription";

/** Every nav route with the permission it needs (children inherit the parent's). */
const ROUTES = sidebarSections
  .flatMap((s) => s.items.flatMap((m) => [m, ...(m.children ?? []).map((c) => ({ ...c, perm: c.perm ?? m.perm }))]))
  .filter((r) => r.path && r.perm);

/**
 * The permission a dashboard page needs: the nav route that matches the URL best
 * (so /dashboard/customers/123 needs customer.view). Pages outside the nav need none.
 */
export function pagePermission(pathname) {
  let best = null;
  for (const r of ROUTES) {
    // "exact" only matters for highlighting; /dashboard itself must not cover every page
    const hit = r.path === "/dashboard" ? pathname === r.path : pathname === r.path || pathname.startsWith(`${r.path}/`);
    if (hit && (!best || r.path.length > best.path.length)) best = r;
  }
  return best?.perm ?? null;
}

/**
 * The dashboard nav for this user: hides what their permissions do not allow and
 * shows plan-locked features with a lock that leads to the upgrade page.
 */
export function useDashboardNav() {
  const { can, subscription } = useAuth();
  const features = subscription?.plan?.features ?? [];
  const locked = (x) => x.feature && !features.includes(x.feature);
  const toItem = (x) => ({
    title: x.title,
    href: locked(x) ? UPGRADE : x.path,
    icon: x.icon,
    exact: x.exact,
    badge: locked(x) ? <Lock className="ml-auto size-3.5 text-zinc-400" aria-label="Not in your plan" /> : null,
  });
  return sidebarSections
    .map((s) => ({
      title: s.title,
      items: s.items
        .filter((m) => !m.perm || can(m.perm))
        .map((m) => (m.children ? { ...toItem(m), children: m.children.filter((c) => !c.perm || can(c.perm)).map((c) => ({ ...toItem(c), title: locked(c) ? `${c.title} 🔒` : c.title })) } : toItem(m)))
        .filter((m) => !m.children || m.children.length),
    }))
    .filter((s) => s.items.length);
}
