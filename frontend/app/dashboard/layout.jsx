"use client";

import { Wifi } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useDashboardNav } from "@/components/dashboard/Sidebar";
import Topbar, { DashboardBanners } from "@/components/dashboard/Topbar";
import AppShell from "@/components/shell/AppShell";
import { ShellLoading } from "@/components/ui/Skeleton";
import { useAuth } from "@/providers/AuthProvider";

export default function DashboardLayout({ children }) {
  const { status, company } = useAuth();
  const router = useRouter();
  const nav = useDashboardNav();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return <ShellLoading />;
  }

  const brand = (
    <>
      {company?.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- ISP logo from the API host
        <img src={company.logo} alt="" className="size-8 rounded-lg border border-line object-contain" />
      ) : (
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary-600 text-white">
          <Wifi className="size-4" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{company?.name ?? "ISP Manager"}</span>
        <span className="block truncate text-xs text-muted">ISP Manager</span>
      </span>
    </>
  );

  return (
    <AppShell brand={brand} nav={nav} banners={<DashboardBanners />} topbar={<Topbar />}>
      {children}
    </AppShell>
  );
}
