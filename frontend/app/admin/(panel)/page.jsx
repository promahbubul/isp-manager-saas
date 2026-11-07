"use client";

import Link from "next/link";
import { Card, ErrorBox, Loading, PageHeader, Stat, StatusBadge, Table } from "@/components/ui";
import { useAdminApi } from "@/lib/adminHooks";
import { formatDate, taka } from "@/lib/format";

const money = (amount, currency) => (currency === "USD" ? `$${amount.toLocaleString()}` : taka(amount));

export default function AdminHome() {
  const { data, isLoading, error } = useAdminApi("metrics", "/admin/metrics", undefined, { refetchInterval: 60_000 });
  const gateways = useAdminApi("gateways", "/admin/gateways");
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const m = data.data;
  const on = (gateways.data?.data?.gateways ?? []).filter((g) => g.enabled).map((g) => g.gateway);
  const rev30 = (scope) => m.revenue30.filter((r) => r.scope === scope).map((r) => money(r.amount, r.currency)).join(" + ") || "—";

  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" />
      {on.length === 0 && (
        <ErrorBox>
          No payment method is enabled — ISPs cannot pay. <Link className="underline" href="/admin/gateways">Enable one</Link>.
        </ErrorBox>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="MRR (list price)" value={taka(m.mrrBDT)} hint={`ARR ${taka(m.arrBDT)}`} tone="green" />
        <Stat label="Subscriptions revenue (30 days)" value={rev30("subscription")} />
        <Stat label="SMS credit sales (30 days)" value={rev30("sms_credit")} />
        <Stat label="Manual payments to verify" value={m.pendingManual} tone={m.pendingManual ? "amber" : "slate"} href="/admin/payments" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="ISPs" value={m.tenants.total} href="/admin/companies" />
        <Stat label="Paying (active)" value={m.tenants.active} tone="green" href="/admin/companies?status=active" />
        <Stat label="On trial" value={m.tenants.trial} hint={`${m.tenants.trialsEnding7} ending in 7 days`} href="/admin/companies?status=trial" />
        <Stat label="Past due" value={m.tenants.past_due} tone="amber" href="/admin/companies?status=past_due" />
        <Stat label="Suspended" value={m.tenants.suspended} tone="red" href="/admin/companies?status=suspended" />
        <Stat label="End customers" value={m.endCustomers.toLocaleString("en-IN")} hint="across all ISPs" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Recent signups" className="lg:col-span-2">
          <Table
            rows={m.recentSignups}
            columns={[
              { key: "name", header: "ISP", render: (c) => <Link className="text-primary-700 hover:underline" href={`/admin/companies/${c._id}`}>{c.name}</Link> },
              { key: "slug", header: "Subdomain" },
              { key: "status", header: "Status", render: (c) => <StatusBadge status={c.status === "trial" ? "pending" : c.status} /> },
              { key: "customers", header: "Customers", render: (c) => c.usage?.customers ?? 0 },
              { key: "createdAt", header: "Joined", render: (c) => formatDate(c.createdAt) },
            ]}
          />
        </Card>
        <Card title="Paying ISPs by plan">
          {Object.keys(m.paidByPlan).length === 0 ? (
            <p className="text-sm text-zinc-500">No paying ISPs yet.</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(m.paidByPlan).map(([plan, n]) => (
                <li key={plan} className="flex justify-between">
                  <span>{plan}</span>
                  <strong>{n}</strong>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-zinc-500">
            All-time received: {Object.entries(m.revenueAllTime).map(([c, a]) => money(a, c)).join(" + ") || "—"}
          </p>
        </Card>
      </div>
    </div>
  );
}
