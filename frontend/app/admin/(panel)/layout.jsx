"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { adminApi, refreshAdminToken, setAdminFailureHandler, setAdminToken } from "@/lib/adminApi";

const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/gateways", label: "Payment gateways" },
  { href: "/admin/coupons", label: "Coupons" },
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
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
            <span className="font-extrabold italic text-purple-300">Platform Admin</span>
            <nav className="flex gap-1">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className={`rounded px-3 py-1.5 text-sm ${pathname === n.href ? "bg-white/20" : "hover:bg-white/10"}`}>
                  {n.label}
                </Link>
              ))}
            </nav>
            <span className="ml-auto text-sm text-slate-300">
              {admin.name} ({admin.role})
            </span>
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
