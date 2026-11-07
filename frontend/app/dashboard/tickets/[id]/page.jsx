"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import { CATEGORIES } from "@/components/ticket/TicketForm";
import { Badge, Button, Card, ErrorBox, InfoList, Loading, PageHeader, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";
import TicketAttachments, { SlaBadge } from "@/components/ticket/TicketAttachments";

const STATUS_LABEL = { open: "Open", in_progress: "In progress", solved: "Solved", closed: "Closed" };
const STATUS_COLOR = { open: "red", in_progress: "amber", solved: "green", closed: "slate" };
const categoryLabel = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

export default function TicketDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const [comment, setComment] = useState("");
  const { data, isLoading, error } = useApi(["ticket", id], `/tickets/${id}`);
  const assignees = useApi("ticket-assignees", "/tickets/assignees", undefined, { enabled: can("ticket.assign") });
  const invalidate = [["ticket", id], "tickets", "ticket-counts"];
  const assign = useApiMutation((assignedTo) => api.patch(`/tickets/${id}/assign`, { assignedTo: assignedTo || null }), { invalidate });
  const status = useApiMutation((s) => api.patch(`/tickets/${id}/status`, { status: s }), { invalidate });
  const addComment = useApiMutation((text) => api.post(`/tickets/${id}/comments`, { text }), {
    invalidate,
    successToast: false,
    onSuccess: () => setComment(""),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const t = data.data;
  const done = t.status === "solved" || t.status === "closed";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t.ticketNo} · ${t.subject}`}
        subtitle={`Created ${formatDateTime(t.createdAt)} by ${t.createdBy?.name ?? "—"}`}
        actions={
          <PermissionGate perm="ticket.solve">
            {!done ? (
              <>
                {t.status === "open" && (
                  <Button variant="secondary" onClick={() => status.mutate("in_progress")}>
                    Start work
                  </Button>
                )}
                <Button variant="success" onClick={() => status.mutate("solved")}>
                  Mark solved
                </Button>
              </>
            ) : (
              <>
                {t.status === "solved" && (
                  <Button variant="secondary" onClick={() => status.mutate("closed")}>
                    Close
                  </Button>
                )}
                <Button variant="secondary" onClick={() => status.mutate("open")}>
                  Reopen
                </Button>
              </>
            )}
          </PermissionGate>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Conversation" className="lg:col-span-2">
          {t.description && <p className="mb-4 whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-zinc-800">{t.description}</p>}
          <ol className="space-y-3">
            {t.comments.map((c, i) => (
              <li key={i} className={c.system ? "text-sm text-zinc-500" : "rounded-md border border-zinc-200 p-3"}>
                {c.system ? (
                  <span>
                    • {c.text} — {c.by?.name ?? "system"}, {formatDateTime(c.at)}
                  </span>
                ) : (
                  <>
                    <p className="text-xs text-zinc-500">
                      <strong className="text-zinc-700">{c.fromCustomer ? `${t.customer?.name ?? "Customer"} (customer, via portal)` : c.by?.name}</strong> · {formatDateTime(c.at)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{c.text}</p>
                  </>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-4 border-t border-zinc-200 pt-4">
            <Textarea placeholder="Write an update..." value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="mt-2 flex justify-end">
              <Button size="sm" disabled={!comment.trim()} loading={addComment.isPending} onClick={() => addComment.mutate(comment)}>
                Add comment
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Details">
            <InfoList
              items={[
                { label: "Status", value: <Badge color={STATUS_COLOR[t.status]}>{STATUS_LABEL[t.status]}</Badge> },
                { label: "Priority", value: t.priority },
                { label: "Category", value: categoryLabel[t.category] },
                { label: "Source", value: t.source },
                { label: "SLA", value: <SlaBadge ticket={t} /> },
                { label: "Solved at", value: t.solvedAt ? formatDateTime(t.solvedAt) : undefined, hidden: !t.solvedAt },
              ]}
            />
            <div className="mt-4">
              {can("ticket.assign") ? (
                <Select
                  label="Assigned to"
                  placeholder="— Unassigned —"
                  value={t.assignedTo?._id ?? ""}
                  onChange={(e) => assign.mutate(e.target.value)}
                  options={(assignees.data?.data ?? []).map((u) => ({ value: u._id, label: `${u.name} (${u.role})` }))}
                />
              ) : (
                <p className="text-sm">
                  Assigned to: <strong>{t.assignedTo?.name ?? "nobody"}</strong>
                </p>
              )}
            </div>
          </Card>

          {t.customer && (
            <Card title="Customer">
              <InfoList
                items={[
                  { label: "Name", value: <Link className="text-primary-700 hover:underline" href={`/dashboard/customers/${t.customer._id}`}>{t.customer.name}</Link> },
                  { label: "ID", value: t.customer.customerId },
                  { label: "Mobile", value: t.customer.phone ? <a href={`tel:${t.customer.phone}`} className="text-primary-700">{t.customer.phone}</a> : undefined },
                  { label: "Username", value: t.customer.pppoe?.username },
                  { label: "Address", value: t.customer.address },
                ]}
              />
            </Card>
          )}
          <TicketAttachments ticket={t} queryKey={["ticket", id]} />
        </div>
      </div>
    </div>
  );
}
