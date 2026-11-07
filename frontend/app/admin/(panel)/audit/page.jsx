"use client";

import { useState } from "react";
import { ErrorBox, Loading, PageHeader, Pagination, Table } from "@/components/ui";

import { usePaged } from "@/lib/usePaged";
import { formatDateTime } from "@/lib/format";

export default function AdminAuditPage() {
  const [q, setQ] = useState({ search: "", page: 1 });
  const list = usePaged("audit", "/admin/audit-logs", { ...q, page: undefined }, { client: "admin" });
  const { data, isLoading, error } = list;

  return (
    <div>
      <PageHeader title="Platform audit log" subtitle="Every change made by platform staff, including impersonation" />
      <input
        className="mb-4 w-full rounded-md border border-zinc-300 px-3 py-2 sm:w-96"
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
            indexOffset={list.indexOffset}
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
          <Pagination {...list.pager} />
        </>
      )}
    </div>
  );
}
