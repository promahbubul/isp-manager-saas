"use client";

import { AlarmClock, Ban, CalendarDays, CircleCheck, CircleX, Gift, HandCoins, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { CollectionChart } from "@/components/charts/Charts";
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
          <span className="text-sm font-normal text-zinc-500">
            {ob.completed}/{ob.total} done
          </span>
          <span className="h-2 w-32 overflow-hidden rounded-full bg-zinc-200">
            <span className="block h-full bg-emerald-500" style={{ width: `${(ob.completed / ob.total) * 100}%` }} />
          </span>
        </span>
      }
    >
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-emerald-500 text-white" : "bg-zinc-200"}`}>
              {s.done ? "✓" : i + 1}
            </span>
            {s.done ? (
              <span className="text-zinc-500 line-through">{s.label}</span>
            ) : (
              <Link href={s.href} className="text-primary-700 hover:underline">
                {s.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** A reseller sees their balance first: every recharge they do is paid from it. */
function ResellerBalance() {
  const { data } = useApi("reseller-me", "/resellers/me");
  const r = data?.data;
  if (!r) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat label="My balance" value={taka(r.reseller.balance)} tone={r.reseller.balance <= 0 ? "red" : "green"} />
      <Stat label="Active customers" value={r.customers.active ?? 0} />
      <Stat label="Expired customers" value={r.customers.expired ?? 0} tone="amber" />
    </div>
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
        <p className="mt-1 text-zinc-500">
          {company?.name} · {plan?.name} plan · {company?.usage?.customers ?? 0}/{limit(plan?.limits?.customers)} customers
        </p>
      </div>

      {user?.role === "reseller" ? <ResellerBalance /> : <GettingStarted d={d} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={HandCoins} label="Today's collection" value={taka(d.collection.today.amount)} hint={`${d.collection.today.count} payment(s)`} tone="green" href="/dashboard/billing/payments" />
        <Stat icon={CalendarDays} label="This month" value={taka(d.collection.month.amount)} hint={`${d.collection.month.count} payment(s)`} tone="green" />
        <Stat icon={Wallet} label="Total due" value={taka(d.totalDue)} tone={d.totalDue ? "red" : "slate"} />
        <Stat icon={AlarmClock} label="Expiring in 3 days" value={d.expiring3Days} hint={`${d.expiringToday} today`} tone="amber" href="/dashboard/customers?expiring=3" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat icon={Users} label="Total customers" value={d.customers.total} href="/dashboard/customers" />
        <Stat icon={CircleCheck} label="Active" value={d.customers.active} tone="green" href="/dashboard/customers?status=active" />
        <Stat icon={CircleX} label="Expired" value={d.customers.expired} tone="red" href="/dashboard/customers?status=expired" />
        <Stat icon={Ban} label="Disabled" value={d.customers.disabled} href="/dashboard/customers?status=disabled" />
        <Stat icon={Gift} label="Free" value={d.customers.free} href="/dashboard/customers?status=free" />
      </div>

      {d.trend && (
        <Card title="Collection — last 14 days">
          <CollectionChart data={d.trend} />
        </Card>
      )}

      <Card title="Recent payments" bodyClassName="p-0">
        <Table
          height="auto"
          className="rounded-none border-0 shadow-none"
          rows={d.recentPayments}
          empty="No payments yet."
          columns={[
            { key: "receiptNo", header: "Receipt", render: (p) => <Link className="text-primary-700 hover:underline" href={`/dashboard/billing/receipt/${p._id}`}>{p.receiptNo}</Link> },
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
