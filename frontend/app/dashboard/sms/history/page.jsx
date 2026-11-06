"use client";

import { useState } from "react";
import { ErrorBox, Loading, PageHeader, Pagination, Select, StatusBadge, Table } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";

const EVENTS = ["welcome", "payment_success", "expiry_reminder", "expired", "ticket_update", "manual", "bulk"].map((e) => ({ value: e, label: e.replace("_", " ") }));
const STATUSES = ["sent", "failed", "queued"].map((s) => ({ value: s, label: s }));

export default function SmsHistoryPage() {
  const [q, setQ] = useState({ search: "", event: "", status: "", page: 1 });
  const params = Object.fromEntries(Object.entries({ ...q, limit: 25 }).filter(([, v]) => v !== ""));
  const { data, isLoading, error } = useApi(["sms-logs", params], "/sms/logs", params);
  const set = (k) => (e) => setQ((s) => ({ ...s, [k]: e.target.value, page: 1 }));

  return (
    <div>
      <PageHeader title="SMS history" />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input className="rounded-md border border-slate-300 px-3 py-2" placeholder="Search number or text" value={q.search} onChange={set("search")} />
        <Select placeholder="All types" options={EVENTS} value={q.event} onChange={set("event")} />
        <Select placeholder="All statuses" options={STATUSES} value={q.status} onChange={set("status")} />
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={data?.data ?? []}
            columns={[
              { key: "createdAt", header: "Time", render: (l) => formatDateTime(l.createdAt) },
              { key: "to", header: "To", render: (l) => (l.customer ? `${l.to} (${l.customer.name})` : l.to) },
              { key: "event", header: "Type", render: (l) => l.event.replace("_", " ") },
              { key: "message", header: "Message", className: "max-w-md whitespace-normal", render: (l) => <span className="line-clamp-2">{l.message}</span> },
              { key: "segments", header: "Credits" },
              { key: "status", header: "Status", render: (l) => <span title={l.error}><StatusBadge status={l.status === "sent" ? "success" : l.status} /></span> },
            ]}
          />
          <Pagination meta={data?.meta} onPage={(page) => setQ((s) => ({ ...s, page }))} />
        </>
      )}
    </div>
  );
}
