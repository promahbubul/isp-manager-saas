"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PRIORITY_COLOR, SUPPORT_CATEGORIES, SUPPORT_STATUS, supportCategoryLabel } from "@/components/support/supportMeta";
import { Badge, ErrorBox, Loading, PageHeader, Select, Stat, Table } from "@/components/ui";

import { usePaged } from "@/lib/usePaged";
import { formatDateTime } from "@/lib/format";

export default function AdminSupportPage() {
  const router = useRouter();
  const [q, setQ] = useState({ status: "open", priority: "", category: "", search: "", page: 1 });
  const list = usePaged("support", "/admin/support-tickets", { ...q, page: undefined }, { client: "admin" });
  const { data, isLoading, error } = list;
  const set = (k) => (e) => setQ((s) => ({ ...s, [k]: e.target.value, page: 1 }));
  const counts = data?.data?.counts ?? {};

  return (
    <div>
      <PageHeader title="ISP support" subtitle="Requests from ISPs to the platform team. Oldest unanswered first is a good habit." />
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Stat label="Waiting for us" value={counts.open ?? 0} tone="red" />
        <Stat label="Waiting for ISP" value={counts.answered ?? 0} tone="amber" />
        <Stat label="Closed" value={counts.closed ?? 0} />
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-100" placeholder="Search ref or subject" value={q.search} onChange={set("search")} />
        <Select value={q.status} onChange={set("status")} options={[{ value: "", label: "All statuses" }, ...Object.entries(SUPPORT_STATUS).map(([value, s]) => ({ value, label: s.label }))]} />
        <Select value={q.priority} onChange={set("priority")} options={[{ value: "", label: "Any priority" }, { value: "urgent", label: "Urgent" }, { value: "normal", label: "Normal" }, { value: "low", label: "Low" }]} />
        <Select value={q.category} onChange={set("category")} options={[{ value: "", label: "Any category" }, ...SUPPORT_CATEGORIES]} />
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table pager={list.pager}
            indexOffset={list.indexOffset}
            rows={data?.data?.tickets ?? []}
            empty="Nothing here."
            onRowClick={(t) => router.push(`/admin/support/${t._id}`)}
            columns={[
              { key: "ref", header: "Ref" },
              { key: "company", header: "ISP", render: (t) => t.company?.name ?? "—" },
              { key: "subject", header: "Subject", className: "max-w-xs truncate", render: (t) => <strong>{t.subject}</strong> },
              { key: "category", header: "Category", render: (t) => supportCategoryLabel[t.category] },
              { key: "priority", header: "Priority", render: (t) => <Badge color={PRIORITY_COLOR[t.priority]}>{t.priority}</Badge> },
              { key: "status", header: "Status", render: (t) => <Badge color={SUPPORT_STATUS[t.status]?.color}>{t.status === "open" ? "Waiting for us" : SUPPORT_STATUS[t.status]?.label}</Badge> },
              { key: "lastMessageAt", header: "Last message", render: (t) => formatDateTime(t.lastMessageAt) },
            ]}
          />
        </>
      )}
    </div>
  );
}
