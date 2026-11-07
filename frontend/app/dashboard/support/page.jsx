"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PRIORITY_COLOR, SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SUPPORT_STATUS, supportCategoryLabel } from "@/components/support/supportMeta";
import { Badge, Button, ErrorBox, Input, Loading, Modal, PageHeader, Pagination, Select, Table, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";

const EMPTY = { subject: "", category: "technical", priority: "normal", message: "" };

function NewTicket({ onClose }) {
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const create = useApiMutation(() => api.post("/support", f), {
    invalidate: ["support"],
    onSuccess: (res) => router.push(`/dashboard/support/${res.data._id}`),
  });
  return (
    <Modal open onClose={onClose} title="Contact platform support">
      <div className="space-y-4">
        <Input label="Subject" value={f.subject} onChange={set("subject")} placeholder="e.g. bKash payment not reflected" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Category" value={f.category} onChange={set("category")} options={SUPPORT_CATEGORIES} />
          <Select label="Priority" value={f.priority} onChange={set("priority")} options={SUPPORT_PRIORITIES} />
        </div>
        <Textarea label="Message" rows={6} value={f.message} onChange={set("message")} hint="Include customer IDs, router name, TrxID or screenshots links if relevant." />
        <Button loading={create.isPending} disabled={f.subject.trim().length < 5 || f.message.trim().length < 2} onClick={() => create.mutate()}>
          Send
        </Button>
      </div>
    </Modal>
  );
}

export default function SupportPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState({ status: "", page: 1 });
  const params = Object.fromEntries(Object.entries({ ...q, limit: 25 }).filter(([, v]) => v !== ""));
  const { data, isLoading, error } = useApi(["support", params], "/support", params);

  return (
    <div>
      <PageHeader
        title="Platform support"
        subtitle="Questions about the software, your subscription or something not working? Our team replies here."
        actions={<Button onClick={() => setCreating(true)}>+ New request</Button>}
      />
      <div className="mb-4 max-w-xs">
        <Select
          value={q.status}
          onChange={(e) => setQ({ status: e.target.value, page: 1 })}
          options={[{ value: "", label: "All" }, ...Object.entries(SUPPORT_STATUS).map(([value, s]) => ({ value, label: s.label }))]}
        />
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={data?.data ?? []}
            empty="No requests yet."
            onRowClick={(t) => router.push(`/dashboard/support/${t._id}`)}
            columns={[
              { key: "ref", header: "Ref" },
              { key: "subject", header: "Subject", className: "max-w-xs truncate", render: (t) => <strong>{t.subject}</strong> },
              { key: "category", header: "Category", render: (t) => supportCategoryLabel[t.category] },
              { key: "priority", header: "Priority", render: (t) => <Badge color={PRIORITY_COLOR[t.priority]}>{t.priority}</Badge> },
              { key: "status", header: "Status", render: (t) => <Badge color={SUPPORT_STATUS[t.status]?.color}>{SUPPORT_STATUS[t.status]?.label}</Badge> },
              { key: "lastMessageAt", header: "Last update", render: (t) => formatDateTime(t.lastMessageAt) },
            ]}
          />
          <Pagination meta={data?.meta} onPage={(page) => setQ((s) => ({ ...s, page }))} />
        </>
      )}
      {creating && <NewTicket onClose={() => setCreating(false)} />}
    </div>
  );
}
