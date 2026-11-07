"use client";

import { useState } from "react";
import { ErrorBox, Input, Loading, PageHeader, Pagination, Select, Table } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

import { usePaged } from "@/lib/usePaged";

const ENTITIES = ["customer", "payment", "router", "package", "zone", "user", "ticket", "sms", "setting"].map((e) => ({ value: e, label: e }));

export default function ActivityLogPage() {
  const [q, setQ] = useState({ search: "", entity: "", from: "", to: "", page: 1 });
  const list = usePaged("activity", "/activity-logs", { ...q, page: undefined });
  const { data, isLoading, error } = list;
  const set = (k) => (e) => setQ((s) => ({ ...s, [k]: e.target.value, page: 1 }));

  return (
    <div>
      <PageHeader title="Activity log" subtitle="Who changed what, and when" />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Input label="Search" placeholder="action or text" value={q.search} onChange={set("search")} />
        <Select label="Area" placeholder="All" options={ENTITIES} value={q.entity} onChange={set("entity")} />
        <Input label="From" type="date" value={q.from} onChange={set("from")} />
        <Input label="To" type="date" value={q.to} onChange={set("to")} />
      </div>
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
              { key: "user", header: "User", render: (l) => (l.user ? `${l.user.name} (${l.user.role})` : "—") },
              { key: "action", header: "Action", render: (l) => <code className="text-xs">{l.action}</code> },
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
