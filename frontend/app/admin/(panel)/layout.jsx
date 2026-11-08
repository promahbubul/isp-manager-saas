"use client";

import { Bug, Building2, ChevronRight, CreditCard, HeartPulse, KeyRound, Landmark, Layers, LayoutDashboard, LifeBuoy, Megaphone, Newspaper, ScrollText, Settings, ShieldCheck, TicketPercent, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import AppShell from "@/components/shell/AppShell";
import { ShellLoading } from "@/components/ui/Skeleton";
import { Tip } from "@/components/ui/Tip";
import UserMenu from "@/components/shell/UserMenu";
import ThemeToggle from "@/components/shell/ThemeToggle";
import { createContext, useContext, useEffect, useState } from "react";
import { adminApi, refreshAdminToken, setAdminFailureHandler, setAdminToken } from "@/lib/adminApi";
import { site } from "@/lib/site";

/** "Section / Page" in the top bar, from NAV below. */
function AdminBreadcrumb() {
  const pathname = usePathname();
  for (const sec of NAV) {
    const item = sec.items.find((i) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`)));
    if (item) {
      const trail = sec.title && sec.title !== item.title ? [sec.title, item.title] : [item.title];
      return (
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          {trail.map((t, i) => {
            const last = i === trail.length - 1;
            return (
              // phones: only the page name, so it never gets cut off
              <span key={t} className={last ? "flex min-w-0 items-center gap-1.5" : "hidden shrink-0 items-center gap-1.5 sm:flex"}>
                {i > 0 && <ChevronRight className="hidden size-3.5 shrink-0 text-zinc-400 sm:block" />}
                <span className={last ? "truncate font-medium text-ink" : "text-muted"}>{t}</span>
              </span>
            );
          })}
        </nav>
      );
    }
  }
  return null;
}

const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);

const NAV = [
  { items: [{ title: "Overview", href: "/admin", icon: LayoutDashboard, exact: true }] },
  {
    title: "ISPs",
    items: [
      { title: "ISPs", href: "/admin/companies", icon: Building2 },
      { title: "Support", href: "/admin/support", icon: LifeBuoy },
      { title: "Payments", href: "/admin/payments", icon: CreditCard },
    ],
  },
  {
    title: "Catalog",
    items: [
      { title: "Plans", href: "/admin/plans", icon: Layers },
      { title: "Coupons", href: "/admin/coupons", icon: TicketPercent },
      { title: "Announcements", href: "/admin/announcements", icon: Megaphone },
      { title: "Website content", href: "/admin/content", icon: Newspaper },
    ],
  },
  {
    title: "Platform",
    items: [
      { title: "Gateways", href: "/admin/gateways", icon: Landmark },
      { title: "System health", href: "/admin/system", icon: HeartPulse },
      { title: "Errors", href: "/admin/errors", icon: Bug },
      { title: "Audit log", href: "/admin/audit", icon: ScrollText },
      { title: "Admins", href: "/admin/users", icon: Users, superOnly: true },
      { title: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

export default function AdminPanelLayout({ children }) {
  const router = useRouter();
  const [admin, setAdmin] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    setAdminFailureHandler(() => router.replace("/login?session=expired"));
    refreshAdminToken()
      .then(() => adminApi.get("/auth/admin/me"))
      .then((r) => {
        setAdmin(r.data.data);
        setStatus("ready");
      })
      .catch(() => router.replace("/login?session=expired"));
  }, [router]);

  const logout = async () => {
    await adminApi.post("/auth/admin/logout").catch(() => undefined);
    setAdminToken(null);
    router.replace("/login?session=ended");
  };

  if (status !== "ready") {
    return <ShellLoading />;
  }

  const nav = NAV.map((sec) => ({ ...sec, items: sec.items.filter((n) => !n.superOnly || admin.role === "super_admin") })).filter((sec) => sec.items.length);
  const brand = (
    <>
      <span className="flex size-8 items-center justify-center rounded-lg bg-ink text-surface">
        <ShieldCheck className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">Platform admin</span>
        <span className="block truncate text-xs text-muted">{site.name}</span>
      </span>
    </>
  );
  const topbar = (
    <>
      <div className="min-w-0 flex-1">
        <AdminBreadcrumb />
      </div>
      <ThemeToggle />
      <UserMenu
        name={admin.name}
        subtitle={admin.role.replace("_", " ")}
        onLogout={logout}
        warning={!admin.twoFactor?.enabled && <Tip content="Two-factor login is off. Turn it on from your profile."><span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">2FA off</span></Tip>}
        links={[{ title: "My account & 2FA", href: "/admin/account", icon: KeyRound }]}
      />
    </>
  );

  return (
    <AdminContext.Provider value={admin}>
      <AppShell brand={brand} nav={nav} topbar={topbar}>
        {children}
      </AppShell>
    </AdminContext.Provider>
  );
}
