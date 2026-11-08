"use client";

import { AlarmClock, ArrowRight, CalendarDays, Check, HandCoins, Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { CollectionChart } from "@/components/charts/Charts";
import { buttonVariants } from "@/components/ui/Button";
import { Card, ErrorBox, Loading, PageHeader, StatCell, StatGroup, Table } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDateTime, taka } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

const limit = (n) => (n === -1 ? "∞" : n);

/** First-run checklist (from the API) until every setup step is done. */
function GettingStarted({ d }) {
  const { can } = useAuth();
  const ob = d.onboarding;
  if (!ob || ob.completed === ob.total || !can("setting.manage")) return null;
  const pct = Math.round((ob.completed / ob.total) * 100);
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Finish setting up your ISP</h2>
          <p className="mt-0.5 text-sm text-muted">
            {ob.completed} of {ob.total} steps done
          </p>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 sm:w-48">
          <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ob.steps.map((s, i) => (
          <li key={s.label}>
            {s.done ? (
              <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                <span className="line-through">{s.label}</span>
              </div>
            ) : (
              <Link href={s.href} className="group flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:border-primary-300 hover:bg-primary-50">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line text-xs text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">{s.label}</span>
                <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary-600" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A reseller sees their balance first: every recharge they do is paid from it. */
function ResellerBalance() {
  const { data } = useApi("reseller-me", "/resellers/me");
  const r = data?.data;
  if (!r) return null;
  return (
    <StatGroup cols={3}>
      <StatCell label="My balance" value={taka(r.reseller.balance)} tone={r.reseller.balance <= 0 ? "red" : "green"} />
      <StatCell label="Active customers" value={r.customers.active ?? 0} />
      <StatCell label="Expired customers" value={r.customers.expired ?? 0} tone="amber" />
    </StatGroup>
  );
}

const SEGMENTS = [
  { key: "active", label: "Active", color: "bg-emerald-500" },
  { key: "expired", label: "Expired", color: "bg-rose-500" },
  { key: "disabled", label: "Disabled", color: "bg-zinc-400" },
  { key: "free", label: "Free", color: "bg-sky-500" },
];

/** Customer status breakdown: one stacked bar + legend instead of five boxes. */
function CustomerBreakdown({ c }) {
  const total = c.total || 0;
  return (
    <Card
      title="Customers"
      className="flex flex-col"
      actions={
        <Link href="/dashboard/customers" className="text-xs font-medium text-primary-700 hover:underline">
          View all
        </Link>
      }
    >
      <p className="tabular text-3xl font-semibold tracking-tight text-ink">{total}</p>
      <p className="text-sm text-muted">total customers</p>
      <div className="mt-5 flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-200">
        {SEGMENTS.map((s) => (c[s.key] ? <div key={s.key} className={s.color} style={{ width: `${(c[s.key] / Math.max(total, 1)) * 100}%` }} title={`${s.label}: ${c[s.key]}`} /> : null))}
      </div>
      <ul className="mt-5 space-y-1">
        {SEGMENTS.map((s) => (
          <li key={s.key}>
            <Link href={`/dashboard/customers?status=${s.key}`} className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-subtle">
              <span className={cn("size-2.5 rounded-full", s.color)} />
              <span className="flex-1 text-ink">{s.label}</span>
              <span className="tabular font-medium text-ink">{c[s.key] ?? 0}</span>
              <span className="tabular w-10 text-right text-xs text-muted">{total ? Math.round(((c[s.key] ?? 0) / total) * 100) : 0}%</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function DashboardPage() {
  const { user, company, subscription, can } = useAuth();
  const { data, isLoading, error } = useApi("dashboard", "/dashboard", undefined, { refetchInterval: 60_000 });
  const plan = subscription?.plan;

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const d = data.data;
  const firstName = user?.name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back${firstName ? `, ${firstName}` : ""}`}
        subtitle={
          <>
            {company?.name} · {plan?.name} plan · {company?.usage?.customers ?? 0}/{limit(plan?.limits?.customers)} customers
          </>
        }
        actions={
          can("customer.create") && (
            <Link href="/dashboard/customers/create" className={buttonVariants()}>
              <Plus /> Add customer
            </Link>
          )
        }
      />

      {user?.role === "reseller" ? <ResellerBalance /> : <GettingStarted d={d} />}

      <StatGroup>
        <StatCell icon={HandCoins} label="Today's collection" value={taka(d.collection.today.amount)} hint={`${d.collection.today.count} payment(s)`} tone="green" href="/dashboard/billing/payments" />
        <StatCell icon={CalendarDays} label="This month" value={taka(d.collection.month.amount)} hint={`${d.collection.month.count} payment(s)`} />
        <StatCell icon={Wallet} label="Total due" value={taka(d.totalDue)} tone={d.totalDue ? "red" : "slate"} hint="Unpaid bills" />
        <StatCell icon={AlarmClock} label="Expiring in 3 days" value={d.expiring3Days} hint={`${d.expiringToday} today`} tone={d.expiring3Days ? "amber" : "slate"} href="/dashboard/customers?expiring=3" />
      </StatGroup>

      <div className="grid gap-6 lg:grid-cols-3">
        {d.trend ? (
          <Card title="Collection — last 14 days" className="lg:col-span-2">
            <CollectionChart data={d.trend} />
          </Card>
        ) : (
          <div className="lg:col-span-2" />
        )}
        <CustomerBreakdown c={d.customers} />
      </div>

      <Card
        title="Recent payments"
        actions={
          <Link href="/dashboard/billing/payments" className="text-xs font-medium text-primary-700 hover:underline">
            View all
          </Link>
        }
      >
        <Table
          height="auto"
          rows={d.recentPayments}
          empty="No payments yet."
          columns={[
            { key: "receiptNo", header: "Receipt", render: (p) => <Link className="font-medium text-primary-700 hover:underline" href={`/dashboard/billing/receipt/${p._id}`}>{p.receiptNo}</Link> },
            { key: "customer", header: "Customer", render: (p) => p.customer?.name ?? "—" },
            { key: "amount", header: "Amount", render: (p) => <span className="tabular font-medium">{taka(p.amount)}</span> },
            { key: "method", header: "Method", render: (p) => <span className="capitalize">{p.method}</span> },
            { key: "receivedBy", header: "By", render: (p) => p.receivedBy?.name ?? "—" },
            { key: "createdAt", header: "Time", render: (p) => formatDateTime(p.createdAt) },
          ]}
        />
      </Card>
    </div>
  );
}
