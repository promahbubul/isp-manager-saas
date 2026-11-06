"use client";

import { useAuth } from "@/providers/AuthProvider";

/** Render children only if the current user has the permission(s). */
export default function PermissionGate({ perm, children, fallback = null }) {
  const { can } = useAuth();
  const perms = Array.isArray(perm) ? perm : [perm];
  return perms.every(can) ? children : fallback;
}
