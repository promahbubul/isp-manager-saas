"use client";

import { ShieldOff, Wifi } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { pagePermission, useDashboardNav } from "@/components/dashboard/Sidebar";
import { buttonVariants } from "@/components/ui/Button";
import { Empty } from "@/components/ui";
import Topbar, { DashboardBanners } from "@/components/dashboard/Topbar";
import AppShell from "@/components/shell/AppShell";
import { ShellLoading } from "@/components/ui/Skeleton";
import { useAuth } from "@/providers/AuthProvider";

export default function DashboardLayout({ children }) {
  const { status, company, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
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
      {pagePermission(pathname) && !can(pagePermission(pathname)) ? (
        <Empty
          icon={ShieldOff}
          action={
            <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>
              Go to dashboard
            </Link>
          }
        >
          You do not have access to this page. Ask the owner to give your role this permission.
        </Empty>
      ) : (
        children
      )}
    </AppShell>
  );
}
