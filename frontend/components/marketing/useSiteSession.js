"use client";

import { useEffect, useState } from "react";
import { adminApi, refreshAdminToken, setAdminToken } from "@/lib/adminApi";
import { hasAdminSession, hasTenantSession } from "@/lib/session";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Who is looking at the public website?
 *   { kind: "isp", name, avatar, subtitle, logout }   — ISP staff (AuthProvider session)
 *   { kind: "admin", name, subtitle, logout }         — platform admin (separate session)
 *   { kind: "guest" }                                 — nobody logged in
 *   { kind: "pending" }                               — a session cookie exists, still loading
 */
export function useSiteSession() {
  const auth = useAuth();
  const [admin, setAdmin] = useState(null);
  // false on the server and first render (no cookies there), so the markup always matches
  const [hint, setHint] = useState({ tenant: false, admin: false, read: false });

  useEffect(() => {
    const h = { tenant: hasTenantSession(), admin: hasAdminSession(), read: true };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cookies are only readable after mount
    setHint(h);
    if (!h.admin) return;
    refreshAdminToken()
      .then(() => adminApi.get("/auth/admin/me"))
      .then((r) => setAdmin(r.data.data))
      .catch(() => setHint((x) => ({ ...x, admin: false })));
  }, []);

  if (auth.status === "authenticated" && auth.user) {
    return {
      kind: "isp",
      name: auth.user.name,
      avatar: auth.user.avatar,
      subtitle: auth.company?.name ?? auth.user.role,
      logout: () => auth.logout({ redirect: false }),
    };
  }
  if (admin) {
    return {
      kind: "admin",
      name: admin.name,
      subtitle: "Platform admin",
      logout: async () => {
        await adminApi.post("/auth/admin/logout").catch(() => undefined);
        setAdminToken(null);
        setAdmin(null);
        setHint((x) => ({ ...x, admin: false }));
      },
    };
  }
  const waiting = !hint.read || (hint.tenant && auth.status === "loading") || hint.admin;
  return { kind: waiting && (hint.tenant || hint.admin || !hint.read) ? "pending" : "guest" };
}
