"use client";

import { Eye, RotateCw, User } from "lucide-react";
import { useState } from "react";
import { Badge, Button, ErrorBox, InfoList, Input, Loading, Modal, PageHeader, RowActions, Select, StatusBadge, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useApiMutation } from "@/lib/hooks";
import { usePaged } from "@/lib/usePaged";
import { useAuth } from "@/providers/AuthProvider";

const label = (e) => (e ? e.charAt(0).toUpperCase() + e.slice(1).replaceAll("_", " ") : "—");
const EVENTS = ["welcome", "payment_success", "expiry_reminder", "expired", "ticket_update", "manual", "bulk"].map((e) => ({ value: e, label: label(e) }));
const STATUSES = ["sent", "failed", "queued"].map((s) => ({ value: s, label: label(s) }));

export default function SmsHistoryPage() {
  const [q, setQ] = useState({ search: "", event: "", status: "", page: 1 });
  const [viewing, setViewing] = useState(null);
  const list = usePaged("sms-logs", "/sms/logs", { ...q, page: undefined });
  const { data, isLoading, error } = list;
  const { can } = useAuth();
  const resend = useApiMutation((id) => api.post(`/sms/logs/${id}/resend`), { invalidate: ["sms-logs", "sms-balance"] });
  const set = (k) => (e) => setQ((s) => ({ ...s, [k]: e.target.value, page: 1 }));

  return (
    <div>
      <PageHeader title="SMS history" subtitle="Every SMS sent from your account. Failed ones can be sent again." />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input placeholder="Search number or text" value={q.search} onChange={set("search")} />
        <Select placeholder="All types" options={EVENTS} value={q.event} onChange={set("event")} />
        <Select placeholder="All statuses" options={STATUSES} value={q.status} onChange={set("status")} />
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <Table
          pager={list.pager}
          indexOffset={list.indexOffset}
          rows={data?.data ?? []}
          onRowClick={setViewing}
          columns={[
            { key: "createdAt", header: "Time", render: (l) => formatDateTime(l.createdAt) },
            { key: "to", header: "To", render: (l) => (l.customer ? `${l.to} (${l.customer.name})` : l.to) },
            { key: "event", header: "Type", render: (l) => label(l.event) },
            { key: "message", header: "Message", className: "max-w-md whitespace-normal", render: (l) => <span className="line-clamp-2">{l.message}</span> },
            { key: "segments", header: "Credits" },
            { key: "status", header: "Status", render: (l) => <StatusBadge status={l.status} /> },
            {
              key: "actions",
              header: "",
              render: (l) => (
                <RowActions
                  items={[
                    { label: "Details", icon: Eye, onClick: () => setViewing(l) },
                    { label: "Open customer", icon: User, href: l.customer ? `/dashboard/customers/${l.customer._id}` : undefined, hidden: !l.customer },
                    { label: "Send again", icon: RotateCw, separator: true, onClick: () => resend.mutate(l._id), hidden: l.status !== "failed" || !can("sms.send") },
                  ]}
                />
              ),
            },
          ]}
        />
      )}
      {viewing && (
        <Modal
          open
          onClose={() => setViewing(null)}
          title="SMS details"
          footer={
            viewing.status === "failed" && can("sms.send") ? (
              <Button loading={resend.isPending} onClick={() => resend.mutate(viewing._id, { onSuccess: () => setViewing(null) })}>
                Send again
              </Button>
            ) : null
          }
        >
          <InfoList
            items={[
              { label: "To", value: viewing.customer ? `${viewing.to} — ${viewing.customer.name} (${viewing.customer.customerId})` : viewing.to },
              { label: "Type", value: label(viewing.event) },
              { label: "Status", value: <StatusBadge status={viewing.status} /> },
              { label: "Time", value: formatDateTime(viewing.createdAt) },
              { label: "Credits", value: `${viewing.segments} (${viewing.encoding ?? "GSM"})` },
              { label: "Gateway", value: viewing.ownGateway ? <Badge color="blue">Own gateway{viewing.provider ? ` · ${viewing.provider}` : ""}</Badge> : "Platform credits" },
              { label: "Sent by", value: viewing.sentBy?.name ?? "System" },
              ...(viewing.error ? [{ label: "Why it failed", value: <span className="text-rose-600">{viewing.error}</span> }] : []),
            ]}
          />
          <p className="mt-4 whitespace-pre-wrap rounded-lg border border-line bg-subtle p-3 text-sm text-ink">{viewing.message}</p>
        </Modal>
      )}
    </div>
  );
}
