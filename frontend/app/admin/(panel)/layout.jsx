"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { adminApi, refreshAdminToken, setAdminFailureHandler, setAdminToken } from "@/lib/adminApi";

const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/companies", label: "ISPs" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/announcements", label: "Announcements" },
  { href: "/admin/gateways", label: "Gateways" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/users", label: "Admins", superOnly: true },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminPanelLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    setAdminFailureHandler(() => router.replace("/admin/login"));
    refreshAdminToken()
      .then(() => adminApi.get("/auth/admin/me"))
      .then((r) => {
        setAdmin(r.data.data);
        setStatus("ready");
      })
      .catch(() => router.replace("/admin/login"));
  }, [router]);

  const logout = async () => {
    await adminApi.post("/auth/admin/logout").catch(() => undefined);
    setAdminToken(null);
    router.replace("/admin/login");
  };

  if (status !== "ready") return <div className="flex h-screen items-center justify-center text-slate-500">Loading...</div>;

  return (
    <AdminContext.Provider value={admin}>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="bg-slate-900 text-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
            <span className="font-extrabold italic text-purple-300">Platform Admin</span>
            <nav className="flex flex-wrap gap-1">
              {NAV.filter((n) => !n.superOnly || admin.role === "super_admin").map((n) => (
                <Link key={n.href} href={n.href} className={`rounded px-3 py-1.5 text-sm ${(n.href === "/admin" ? pathname === n.href : pathname.startsWith(n.href)) ? "bg-white/20" : "hover:bg-white/10"}`}>
                  {n.label}
                </Link>
              ))}
            </nav>
            <Link href="/admin/account" className="ml-auto text-sm text-slate-300 hover:text-white">
              {admin.name} ({admin.role}){!admin.twoFactor?.enabled && <span className="ml-1 text-amber-400" title="Two-factor authentication is off">⚠ 2FA</span>}
            </Link>
            <button type="button" onClick={logout} className="cursor-pointer rounded border border-slate-600 px-3 py-1 text-sm hover:bg-white/10">
              Logout
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-6">{children}</main>
      </div>
    </AdminContext.Provider>
  );
}
