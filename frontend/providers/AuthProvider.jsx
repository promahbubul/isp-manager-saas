"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, refreshAccessToken, setAccessToken, setAuthFailureHandler } from "@/lib/api";
import { hasTenantSession } from "@/lib/session";

const AuthContext = createContext(null);

const EMPTY = { user: null, company: null, permissions: [], subscription: null, impersonation: null };

export function AuthProvider({ children }) {
  const router = useRouter();
  const [status, setStatus] = useState("loading"); // loading | authenticated | unauthenticated
  const [session, setSession] = useState(EMPTY);

  const loadProfile = useCallback(async () => {
    const { data } = await api.get("/auth/me");
    setSession(data.data);
    setStatus("authenticated");
    return data.data;
  }, []);

  const clear = useCallback(() => {
    setAccessToken(null);
    setSession(EMPTY);
    setStatus("unauthenticated");
  }, []);

  // Restore the session after a page reload using the refresh cookie.
  useEffect(() => {
    setAuthFailureHandler(() => {
      clear();
      router.replace("/login");
    });
    // Public pages (website, login) skip the refresh call when no session hint cookie
    // exists, so logged-out visitors do not trigger a 401 on every page. The dashboard
    // always tries, which also covers sessions created before the hint cookie existed.
    if (!hasTenantSession() && !window.location.pathname.startsWith("/dashboard")) {
      clear();
      return;
    }
    refreshAccessToken()
      .then(loadProfile)
      .catch(clear);
  }, [clear, loadProfile, router]);

  const login = useCallback(
    async (credentials) => {
      const { data } = await api.post("/auth/login", credentials);
      setAccessToken(data.data.accessToken);
      return loadProfile();
    },
    [loadProfile],
  );

  const signup = useCallback(
    async (payload) => {
      const { data } = await api.post("/auth/signup", payload);
      setAccessToken(data.data.accessToken);
      return loadProfile();
    },
    [loadProfile],
  );

  /** Log out; `redirect: false` keeps the visitor on the current page (website header). */
  const logout = useCallback(
    async ({ redirect = true } = {}) => {
      await api.post("/auth/logout").catch(() => undefined);
      clear();
      if (redirect) router.replace("/login");
    },
    [clear, router],
  );

  const can = useCallback((perm) => session.permissions.includes(perm), [session.permissions]);

  const value = useMemo(
    () => ({ status, ...session, login, signup, logout, can, reload: loadProfile }),
    [status, session, login, signup, logout, can, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
