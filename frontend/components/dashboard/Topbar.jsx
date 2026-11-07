"use client";

import Link from "next/link";
import { FiLogOut } from "react-icons/fi";
import { useAuth } from "@/providers/AuthProvider";
import { AnnouncementBanners, ImpersonationBanner } from "./Banners";
import NotificationBell from "./NotificationBell";

const daysLeft = (date) => Math.max(0, Math.ceil((new Date(date) - Date.now()) / 86_400_000));

const Topbar = () => {
  const { user, company, logout } = useAuth();

  return (
    <header className="print:hidden flex flex-col border-b border-slate-200 bg-white">
      <ImpersonationBanner />
      <AnnouncementBanners />
      {company?.status === "trial" && company.trialEndsAt && (
        <div className="bg-amber-100 px-6 py-2 text-sm text-amber-900">
          Free trial: <strong>{daysLeft(company.trialEndsAt)} days</strong> left.{" "}
          <Link href="/dashboard/billing/subscription" className="font-semibold underline">
            Choose a plan
          </Link>
        </div>
      )}
      {(company?.status === "suspended" || company?.status === "past_due") && (
        <div className="bg-red-100 px-6 py-2 text-sm text-red-900">
          Your subscription is inactive. The panel is read-only until you renew.{" "}
          <Link href="/dashboard/billing/subscription" className="font-semibold underline">
            Renew now
          </Link>
        </div>
      )}
      <div className="flex items-center justify-end gap-4 px-6 py-3">
        <NotificationBell />
        <div className="text-right leading-tight">
          <p className="font-semibold text-slate-900">{user?.name}</p>
          <p className="text-xs capitalize text-slate-500">{user?.role}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
        >
          <FiLogOut /> Logout
        </button>
      </div>
    </header>
  );
};

export default Topbar;
