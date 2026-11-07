"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ErrorBox, Loading, PageHeader, Select, StatusBadge, Table } from "@/components/ui";

import { usePaged } from "@/lib/usePaged";
import { formatDate } from "@/lib/format";

const STATUSES = ["trial", "active", "past_due", "suspended", "archived"].map((s) => ({ value: s, label: s.replace("_", " ") }));
const tone = (s) => ({ trial: "pending", active: "active", past_due: "pending", suspended: "expired", archived: "disabled" })[s] ?? s;

function CompaniesList() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState({ search: "", status: params.get("status") ?? "", page: 1 });
  const list = usePaged("companies", "/admin/companies", { ...q, page: undefined }, { client: "admin" });
  const { data, isLoading, error } = list;
  const set = (k) => (e) => setQ((s) => ({ ...s, [k]: e.target.value, page: 1 }));

  return (
    <div>
      <PageHeader title="ISPs" subtitle="Every company on the platform" />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-100 sm:col-span-2" placeholder="Search name, subdomain, email, phone" value={q.search} onChange={set("search")} />
        <Select placeholder="All statuses" options={STATUSES} value={q.status} onChange={set("status")} />
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table pager={list.pager}
            rows={data?.data ?? []}
            onRowClick={(c) => router.push(`/admin/companies/${c._id}`)}
            columns={[
              { key: "name", header: "ISP", render: (c) => <strong>{c.name}</strong> },
              { key: "slug", header: "Subdomain" },
              { key: "phone", header: "Phone" },
              { key: "status", header: "Status", render: (c) => <StatusBadge status={tone(c.status)} /> },
              { key: "plan", header: "Plan", render: (c) => c.subscription?.plan ?? "—" },
              {
                key: "until",
                header: "Until",
                render: (c) => (c.status === "trial" ? `trial · ${formatDate(c.trialEndsAt)}` : formatDate(c.subscription?.currentPeriodEnd)),
              },
              { key: "customers", header: "Customers", render: (c) => c.usage?.customers ?? 0 },
              { key: "sms", header: "SMS", render: (c) => c.smsBalance },
              { key: "createdAt", header: "Joined", render: (c) => formatDate(c.createdAt) },
            ]}
          />
        </>
      )}
    </div>
  );
}

export default function CompaniesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CompaniesList />
    </Suspense>
  );
}
