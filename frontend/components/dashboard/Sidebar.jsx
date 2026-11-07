"use client";

import { Lock } from "lucide-react";
import sidebarSections from "@/app/constant/dashboard/sidebar";
import { useAuth } from "@/providers/AuthProvider";

const UPGRADE = "/dashboard/billing/subscription";

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
