"use client";

import { CreditCard, Settings } from "lucide-react";
import Link from "next/link";
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
      {company?.status === "trial" && company.trialEndsAt && (
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

/** Right side of the top bar. */
export default function Topbar() {
  const { user, company, logout, can } = useAuth();
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink lg:hidden">{company?.name}</p>
      </div>
      <ThemeToggle />
      <NotificationBell />
      <UserMenu
        name={user?.name}
        subtitle={user?.role}
        onLogout={logout}
        links={[
          ...(can("subscription.manage") ? [{ title: "My subscription", href: "/dashboard/billing/subscription", icon: CreditCard }] : []),
          ...(can("setting.manage") ? [{ title: "Settings", href: "/dashboard/settings", icon: Settings }] : []),
        ]}
      />
    </>
  );
}
