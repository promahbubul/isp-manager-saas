"use client";

import { Bug, Building2, CreditCard, HeartPulse, KeyRound, Landmark, Layers, LayoutDashboard, LifeBuoy, Megaphone, Newspaper, ScrollText, Settings, ShieldCheck, TicketPercent, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/shell/AppShell";
import UserMenu from "@/components/shell/UserMenu";
import ThemeToggle from "@/components/shell/ThemeToggle";
import { createContext, useContext, useEffect, useState } from "react";
import { adminApi, refreshAdminToken, setAdminFailureHandler, setAdminToken } from "@/lib/adminApi";

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
    setAdminFailureHandler(() => router.replace("/login"));
    refreshAdminToken()
      .then(() => adminApi.get("/auth/admin/me"))
      .then((r) => {
        setAdmin(r.data.data);
        setStatus("ready");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const logout = async () => {
    await adminApi.post("/auth/admin/logout").catch(() => undefined);
    setAdminToken(null);
    router.replace("/login");
  };

  if (status !== "ready") {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <div className="size-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" role="status" aria-label="Loading" />
      </div>
    );
  }

  const nav = NAV.map((sec) => ({ ...sec, items: sec.items.filter((n) => !n.superOnly || admin.role === "super_admin") })).filter((sec) => sec.items.length);
  const brand = (
    <>
      <span className="flex size-8 items-center justify-center rounded-lg bg-ink text-surface">
        <ShieldCheck className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">Platform admin</span>
        <span className="block truncate text-xs text-muted">ISP Manager</span>
      </span>
    </>
  );
  const topbar = (
    <>
      <div className="min-w-0 flex-1" />
      <ThemeToggle />
      <UserMenu
        name={admin.name}
        subtitle={admin.role.replace("_", " ")}
        onLogout={logout}
        warning={!admin.twoFactor?.enabled && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title="Two-factor authentication is off">2FA off</span>}
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
