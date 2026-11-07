"use client";

import { useState } from "react";
import { ErrorBox, Loading, PageHeader, Pagination, Table } from "@/components/ui";
import { useAdminApi } from "@/lib/adminHooks";
import { formatDateTime } from "@/lib/format";

export default function AdminAuditPage() {
  const [q, setQ] = useState({ search: "", page: 1 });
  const params = Object.fromEntries(Object.entries({ ...q, limit: 50 }).filter(([, v]) => v !== ""));
  const { data, isLoading, error } = useAdminApi(["audit", params], "/admin/audit-logs", params);

  return (
    <div>
      <PageHeader title="Platform audit log" subtitle="Every change made by platform staff, including impersonation" />
      <input
        className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 sm:w-96"
        placeholder="Search action or text"
        value={q.search}
        onChange={(e) => setQ({ search: e.target.value, page: 1 })}
      />
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={data?.data ?? []}
            columns={[
              { key: "createdAt", header: "Time", render: (l) => formatDateTime(l.createdAt) },
              { key: "who", header: "Admin", render: (l) => (l.platformUser ? `${l.platformUser.name} (${l.platformUser.role})` : "—") },
              { key: "action", header: "Action", render: (l) => <code className="text-xs">{l.action}</code> },
              { key: "company", header: "ISP", render: (l) => l.company?.name ?? "—" },
              { key: "summary", header: "Details", className: "whitespace-normal" },
              { key: "ip", header: "IP" },
            ]}
          />
          <Pagination meta={data?.meta} onPage={(page) => setQ((s) => ({ ...s, page }))} />
        </>
      )}
    </div>
  );
}
