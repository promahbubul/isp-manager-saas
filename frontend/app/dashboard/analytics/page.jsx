"use client";

import Link from "next/link";
import { Badge, Card, ErrorBox, Loading, PageHeader, Stat, Table } from "@/components/ui";
import { formatDate, taka } from "@/lib/format";
import { useApi } from "@/lib/hooks";

export default function AnalyticsPage() {
  const { data, isLoading, error } = useApi("analytics", "/analytics");
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { forecast, churn } = data.data;
  const f = forecast.next30Days;

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" subtitle="Collection forecast and customers likely to leave — based on simple rules from your own data" />
      <Card title="Next 30 days: expected collection">
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Expected" value={taka(f.expected)} tone="green" />
          <Stat label="If everyone pays" value={taka(f.gross)} />
          <Stat label="Renewal rate" value={`${f.renewalRate}%`} />
          <Stat label="Customers due" value={f.prepaidCustomers + f.postpaidCustomers} />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Prepaid: {f.prepaidCustomers} customers whose validity ends in the next 30 days (or ended in the last 30) — {taka(f.prepaidAmount)} incl. dues. Postpaid: {f.postpaidCustomers} monthly bills —{" "}
          {taka(f.postpaidAmount)}. Renewal rate = share of customers who paid within 14 days of expiry over the last 3 months.
        </p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="At risk now" value={churn.atRisk} tone="amber" />
        <Stat label="Lost (expired 30+ days)" value={churn.lostCustomers} tone="red" />
        <Stat label="Lost rate" value={`${churn.lostRate}%`} />
      </div>
      <Card title="Customers to call first">
        <Table
          rowKey="key"
          rows={churn.list.map((r) => ({ ...r, key: r.customer._id }))}
          empty="Nobody at risk right now. 🎉"
          columns={[
            { key: "score", header: "Risk", render: (r) => <Badge color={r.score >= 60 ? "red" : r.score >= 40 ? "amber" : "slate"}>{r.score}</Badge> },
            { key: "name", header: "Customer", render: (r) => <Link className="font-medium text-primary-700 hover:underline" href={`/dashboard/customers/${r.customer._id}`}>{`${r.customer.name} (${r.customer.customerId})`}</Link> },
            { key: "phone", header: "Mobile", render: (r) => <a href={`tel:${r.customer.phone}`}>{r.customer.phone}</a> },
            { key: "zone", header: "Zone", render: (r) => r.customer.zone?.name ?? "—" },
            { key: "expiry", header: "Expiry", render: (r) => formatDate(r.customer.expiryDate) },
            { key: "reasons", header: "Why", className: "whitespace-normal", render: (r) => r.reasons.join(" · ") },
          ]}
        />
      </Card>
    </div>
  );
}
