"use client";

import { useState } from "react";
import { ErrorBox, Loading, PageHeader, Select, StatusBadge, Table } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

import { usePaged } from "@/lib/usePaged";

const EVENTS = ["welcome", "payment_success", "expiry_reminder", "expired", "ticket_update", "manual", "bulk"].map((e) => ({ value: e, label: e.replace("_", " ") }));
const STATUSES = ["sent", "failed", "queued"].map((s) => ({ value: s, label: s }));

export default function SmsHistoryPage() {
  const [q, setQ] = useState({ search: "", event: "", status: "", page: 1 });
  const list = usePaged("sms-logs", "/sms/logs", { ...q, page: undefined });
  const { data, isLoading, error } = list;
  const set = (k) => (e) => setQ((s) => ({ ...s, [k]: e.target.value, page: 1 }));

  return (
    <div>
      <PageHeader title="SMS history" />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-100" placeholder="Search number or text" value={q.search} onChange={set("search")} />
        <Select placeholder="All types" options={EVENTS} value={q.event} onChange={set("event")} />
        <Select placeholder="All statuses" options={STATUSES} value={q.status} onChange={set("status")} />
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table pager={list.pager}
            indexOffset={list.indexOffset}
            rows={data?.data ?? []}
            columns={[
              { key: "createdAt", header: "Time", render: (l) => formatDateTime(l.createdAt) },
              { key: "to", header: "To", render: (l) => (l.customer ? `${l.to} (${l.customer.name})` : l.to) },
              { key: "event", header: "Type", render: (l) => l.event.replace("_", " ") },
              { key: "message", header: "Message", className: "max-w-md whitespace-normal", render: (l) => <span className="line-clamp-2">{l.message}</span> },
              { key: "segments", header: "Credits" },
              { key: "status", header: "Status", render: (l) => <span title={l.error}><StatusBadge status={l.status} /></span> },
            ]}
          />
        </>
      )}
    </div>
  );
}
