"use client";

import Link from "next/link";
import { PageHeader, Stat } from "@/components/ui";
import { useAdminApi } from "@/lib/adminHooks";

export default function AdminHome() {
  const pending = useAdminApi(["payments", "pending"], "/admin/payments", { status: "pending_review", limit: 1 });
  const gateways = useAdminApi("gateways", "/admin/gateways");
  const on = (gateways.data?.data?.gateways ?? []).filter((g) => g.enabled).map((g) => g.gateway);

  return (
    <div>
      <PageHeader title="Overview" subtitle="Tenant management and revenue dashboards arrive in Phase 4." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Manual payments to verify" value={pending.data?.meta?.total ?? "—"} tone="amber" href="/admin/payments" />
        <Stat label="Payment methods on" value={on.length ? on.join(", ") : "none"} href="/admin/gateways" />
      </div>
      {on.length === 0 && (
        <p className="mt-6 text-sm text-red-700">
          No payment method is enabled — ISPs cannot pay for subscriptions. <Link className="underline" href="/admin/gateways">Enable one</Link>.
        </p>
      )}
    </div>
  );
}
