"use client";

import { ChevronRight, CreditCard, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import sidebarSections from "@/app/constant/dashboard/sidebar";
import UserMenu from "@/components/shell/UserMenu";
import { useAuth } from "@/providers/AuthProvider";
import { AnnouncementBanners, ImpersonationBanner } from "./Banners";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "@/components/shell/ThemeToggle";

const daysLeft = (date) => Math.max(0, Math.ceil((new Date(date) - Date.now()) / 86_400_000));

/** Banners above the top bar: impersonation, platform announcements, trial / unpaid notices. */
export function DashboardBanners() {
  const { company } = useAuth();
  return (
    <>
      <ImpersonationBanner />
      <AnnouncementBanners />
      {/* a long trial only gets the small badge in the top bar; the banner shows in the last two weeks */}
      {company?.status === "trial" && company.trialEndsAt && daysLeft(company.trialEndsAt) <= 14 && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          Free trial: <strong>{daysLeft(company.trialEndsAt)} days</strong> left.
          <Link href="/dashboard/billing/subscription" className="font-semibold underline underline-offset-2">
            Choose a plan
          </Link>
        </div>
      )}
      {(company?.status === "suspended" || company?.status === "past_due") && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 bg-rose-50 px-4 py-2 text-center text-sm text-rose-900">
          Your subscription is inactive. The panel is read-only until you renew.
          <Link href="/dashboard/billing/subscription" className="font-semibold underline underline-offset-2">
            Renew now
          </Link>
        </div>
      )}
    </>
  );
}

/** "Section / Page" from the sidebar config, shown on desktop where the left of the bar is empty. */
function Breadcrumb() {
  const pathname = usePathname();
  const items = sidebarSections.flatMap((s) => s.items);
  const match = (p, exact) => (exact ? pathname === p : pathname === p || pathname.startsWith(`${p}/`));
  let trail = null;
  for (const item of items) {
    const child = item.children?.find((c) => c.path === pathname) ?? item.children?.find((c) => match(c.path, c.exact));
    if (child) {
      trail = [item.title, child.title];
      break;
    }
    if (item.path && match(item.path, item.path === "/dashboard")) {
      trail = [item.title];
      break;
    }
  }
  if (!trail) return null;
  return (
    <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-sm lg:flex">
      {trail.map((t, i) => (
        <span key={t} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-3.5 text-zinc-400" />}
          <span className={i === trail.length - 1 ? "font-medium text-ink" : "text-muted"}>{t}</span>
        </span>
      ))}
    </nav>
  );
}

/** Right side of the top bar. */
export default function Topbar() {
  const { user, company, logout, can } = useAuth();
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink lg:hidden">{company?.name}</p>
        <Breadcrumb />
      </div>
      {company?.status === "trial" && company.trialEndsAt && daysLeft(company.trialEndsAt) > 14 && (
        <Link
          href="/dashboard/billing/subscription"
          className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-primary-300 hover:text-primary-700 sm:inline-flex"
        >
          <span className="size-1.5 rounded-full bg-sky-500" />
          Trial · {daysLeft(company.trialEndsAt)} days left
        </Link>
      )}
      <ThemeToggle />
      <NotificationBell />
      <UserMenu
        name={user?.name}
        subtitle={user?.role}
        image={user?.avatar}
        onLogout={logout}
        links={[
          { title: "My profile", href: "/dashboard/profile", icon: UserRound },
          ...(can("subscription.manage") ? [{ title: "My subscription", href: "/dashboard/billing/subscription", icon: CreditCard }] : []),
          ...(can("setting.manage") ? [{ title: "Settings", href: "/dashboard/settings", icon: Settings }] : []),
        ]}
      />
    </>
  );
}
