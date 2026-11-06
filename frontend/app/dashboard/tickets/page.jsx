"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import TicketForm, { CATEGORIES } from "@/components/ticket/TicketForm";
import { Badge, Button, ErrorBox, Loading, Modal, PageHeader, Pagination, Select, Stat, StatusBadge, Table } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";

const STATUS = [
  { value: "active", label: "Open + in progress" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "solved", label: "Solved" },
  { value: "closed", label: "Closed" },
  { value: "", label: "All" },
];
const PRIORITY_COLOR = { high: "red", medium: "amber", low: "slate" };
const categoryLabel = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

export default function TicketsPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState({ status: "active", assignedTo: "", search: "", page: 1 });
  const params = Object.fromEntries(Object.entries({ ...q, limit: 25 }).filter(([, v]) => v !== ""));
  const { data, isLoading, error } = useApi(["tickets", params], "/tickets", params);
  const counts = useApi("ticket-counts", "/tickets/counts");
  const set = (k) => (e) => setQ((s) => ({ ...s, [k]: e.target.value, page: 1 }));
  const c = counts.data?.data;

  return (
    <div>
      <PageHeader
        title="Support tickets"
        actions={
          <PermissionGate perm="ticket.create">
            <Button onClick={() => setCreating(true)}>+ New ticket</Button>
          </PermissionGate>
        }
      />
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Stat label="Open" value={c?.open ?? "—"} tone="red" />
        <Stat label="In progress" value={c?.inProgress ?? "—"} tone="amber" />
        <Stat label="Assigned to me" value={c?.mine ?? "—"} />
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input className="rounded-md border border-slate-300 px-3 py-2" placeholder="Search ticket no. or subject" value={q.search} onChange={set("search")} />
        <Select options={STATUS} value={q.status} onChange={set("status")} />
        <Select
          options={[
            { value: "", label: "Anyone" },
            { value: "me", label: "Assigned to me" },
            { value: "none", label: "Unassigned" },
          ]}
          value={q.assignedTo}
          onChange={set("assignedTo")}
        />
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={data?.data ?? []}
            onRowClick={(t) => router.push(`/dashboard/tickets/${t._id}`)}
            columns={[
              { key: "ticketNo", header: "Ticket" },
              { key: "subject", header: "Subject", className: "max-w-xs truncate", render: (t) => <strong>{t.subject}</strong> },
              { key: "customer", header: "Customer", render: (t) => (t.customer ? `${t.customer.name} (${t.customer.customerId})` : "—") },
              { key: "category", header: "Category", render: (t) => categoryLabel[t.category] ?? t.category },
              { key: "priority", header: "Priority", render: (t) => <Badge color={PRIORITY_COLOR[t.priority]}>{t.priority}</Badge> },
              { key: "assignedTo", header: "Assigned", render: (t) => t.assignedTo?.name ?? <span className="text-slate-400">—</span> },
              { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status === "solved" || t.status === "closed" ? "success" : t.status === "open" ? "failed" : "pending"} /> },
              { key: "createdAt", header: "Created", render: (t) => formatDateTime(t.createdAt) },
            ]}
          />
          <Pagination meta={data?.meta} onPage={(page) => setQ((s) => ({ ...s, page }))} />
        </>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="New ticket" size="lg">
        {creating && <TicketForm onDone={() => setCreating(false)} />}
      </Modal>
    </div>
  );
}
