"use client";

import { CheckCircle2, Eye, Lock, PlayCircle, RotateCcw, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import TicketForm, { CATEGORIES } from "@/components/ticket/TicketForm";
import { Badge, Button, ErrorBox, Loading, Modal, PageHeader, RowActions, Select, Stat, StatusBadge, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";
import { usePaged } from "@/lib/usePaged";

const STATUS = [
  { value: "active", label: "Open + in progress" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "solved", label: "Solved" },
  { value: "closed", label: "Closed" },
  { value: "overdue", label: "SLA missed" },
  { value: "", label: "All" },
];
const PRIORITY_COLOR = { high: "red", medium: "amber", low: "slate" };
const categoryLabel = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

export default function TicketsPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState({ status: "active", assignedTo: "", search: "", page: 1 });
  const list = usePaged("tickets", "/tickets", { ...q, page: undefined });
  const { data, isLoading, error } = list;
  const counts = useApi("ticket-counts", "/tickets/counts");
  const { user, can } = useAuth();
  const inv = { invalidate: ["tickets", "ticket-counts"] };
  const setStatus = useApiMutation(({ id, status }) => api.patch(`/tickets/${id}/status`, { status }), inv);
  const assignMe = useApiMutation((id) => api.patch(`/tickets/${id}/assign`, { assignedTo: user?._id ?? user?.id }), inv);
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
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Open" value={c?.open ?? "—"} tone="red" />
        <Stat label="In progress" value={c?.inProgress ?? "—"} tone="amber" />
        <Stat label="Assigned to me" value={c?.mine ?? "—"} />
        <Stat label="SLA missed" value={c?.overdue ?? "—"} tone="red" />
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-100" placeholder="Search ticket no. or subject" value={q.search} onChange={set("search")} />
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
          <Table pager={list.pager}
            indexOffset={list.indexOffset}
            rows={data?.data ?? []}
            onRowClick={(t) => router.push(`/dashboard/tickets/${t._id}`)}
            columns={[
              { key: "ticketNo", header: "Ticket" },
              { key: "subject", header: "Subject", className: "max-w-xs truncate", render: (t) => <strong>{t.subject}</strong> },
              { key: "customer", header: "Customer", render: (t) => (t.customer ? `${t.customer.name} (${t.customer.customerId})` : "—") },
              { key: "category", header: "Category", render: (t) => categoryLabel[t.category] ?? t.category },
              { key: "priority", header: "Priority", render: (t) => <Badge color={PRIORITY_COLOR[t.priority]}>{t.priority}</Badge> },
              { key: "assignedTo", header: "Assigned", render: (t) => t.assignedTo?.name ?? <span className="text-zinc-400">—</span> },
              { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
              { key: "createdAt", header: "Created", render: (t) => formatDateTime(t.createdAt) },
              {
                key: "actions",
                header: "",
                render: (t) => {
                  const done = t.status === "solved" || t.status === "closed";
                  const solve = !can("ticket.solve");
                  return (
                    <RowActions
                      items={[
                        { label: "Open ticket", icon: Eye, href: `/dashboard/tickets/${t._id}` },
                        { label: "Assign to me", icon: UserCheck, separator: true, onClick: () => assignMe.mutate(t._id), hidden: !can("ticket.assign") || done || String(t.assignedTo?._id ?? "") === String(user?._id ?? user?.id) },
                        { label: "Start work", icon: PlayCircle, onClick: () => setStatus.mutate({ id: t._id, status: "in_progress" }), hidden: solve || t.status !== "open" },
                        { label: "Mark solved", icon: CheckCircle2, onClick: () => setStatus.mutate({ id: t._id, status: "solved" }), hidden: solve || done },
                        { label: "Close", icon: Lock, onClick: () => setStatus.mutate({ id: t._id, status: "closed" }), hidden: solve || t.status === "closed" },
                        { label: "Reopen", icon: RotateCcw, onClick: () => setStatus.mutate({ id: t._id, status: "open" }), hidden: solve || !done },
                      ]}
                    />
                  );
                },
              },
            ]}
          />
        </>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="New ticket" size="lg">
        {creating && <TicketForm onDone={() => setCreating(false)} />}
      </Modal>
    </div>
  );
}
