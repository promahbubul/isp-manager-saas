"use client";

import Link from "next/link";
import { Card, ErrorBox, Loading, Stat, Table } from "@/components/ui";
import { formatDateTime, taka } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

const limit = (n) => (n === -1 ? "∞" : n);

/** First-run checklist (from the API) until every setup step is done. */
function GettingStarted({ d }) {
  const { can } = useAuth();
  const ob = d.onboarding;
  if (!ob || ob.completed === ob.total || !can("setting.manage")) return null;
  const steps = ob.steps;
  return (
    <Card
      title={
        <span className="flex items-center gap-3">
          Set up your ISP
          <span className="text-sm font-normal text-slate-500">
            {ob.completed}/{ob.total} done
          </span>
          <span className="h-2 w-32 overflow-hidden rounded-full bg-slate-200">
            <span className="block h-full bg-emerald-500" style={{ width: `${(ob.completed / ob.total) * 100}%` }} />
          </span>
        </span>
      }
    >
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-emerald-500 text-white" : "bg-slate-200"}`}>
              {s.done ? "✓" : i + 1}
            </span>
            {s.done ? (
              <span className="text-slate-500 line-through">{s.label}</span>
            ) : (
              <Link href={s.href} className="text-purple-700 hover:underline">
                {s.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default function DashboardPage() {
  const { user, company, subscription } = useAuth();
  const { data, isLoading, error } = useApi("dashboard", "/dashboard", undefined, { refetchInterval: 60_000 });
  const plan = subscription?.plan;

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const d = data.data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Welcome, {user?.name}</h2>
        <p className="mt-1 text-slate-500">
          {company?.name} · {plan?.name} plan · {company?.usage?.customers ?? 0}/{limit(plan?.limits?.customers)} customers
        </p>
      </div>

      <GettingStarted d={d} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Today's collection" value={taka(d.collection.today.amount)} hint={`${d.collection.today.count} payment(s)`} tone="green" href="/dashboard/billing/payments" />
        <Stat label="This month" value={taka(d.collection.month.amount)} hint={`${d.collection.month.count} payment(s)`} tone="green" />
        <Stat label="Total due" value={taka(d.totalDue)} tone={d.totalDue ? "red" : "slate"} />
        <Stat label="Expiring in 3 days" value={d.expiring3Days} hint={`${d.expiringToday} today`} tone="amber" href="/dashboard/customers?expiring=3" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total customers" value={d.customers.total} href="/dashboard/customers" />
        <Stat label="Active" value={d.customers.active} tone="green" href="/dashboard/customers?status=active" />
        <Stat label="Expired" value={d.customers.expired} tone="red" href="/dashboard/customers?status=expired" />
        <Stat label="Disabled" value={d.customers.disabled} href="/dashboard/customers?status=disabled" />
        <Stat label="Free" value={d.customers.free} href="/dashboard/customers?status=free" />
      </div>

      <Card title="Recent payments">
        <Table
          rows={d.recentPayments}
          empty="No payments yet."
          columns={[
            { key: "receiptNo", header: "Receipt", render: (p) => <Link className="text-purple-700 hover:underline" href={`/dashboard/billing/receipt/${p._id}`}>{p.receiptNo}</Link> },
            { key: "customer", header: "Customer", render: (p) => p.customer?.name ?? "—" },
            { key: "amount", header: "Amount", render: (p) => taka(p.amount) },
            { key: "method", header: "Method" },
            { key: "receivedBy", header: "By", render: (p) => p.receivedBy?.name },
            { key: "createdAt", header: "Time", render: (p) => formatDateTime(p.createdAt) },
          ]}
        />
      </Card>
    </div>
  );
}
