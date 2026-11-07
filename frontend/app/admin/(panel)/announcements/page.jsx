"use client";

import { useState } from "react";
import { Badge, Button, Card, ErrorBox, Input, Loading, PageHeader, Select, Table, Textarea } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminApi, useAdminMutation } from "@/lib/adminHooks";
import { formatDateTime } from "@/lib/format";

export default function AnnouncementsPage() {
  const [form, setForm] = useState({ title: "", body: "", type: "info", endAt: "" });
  const { data, isLoading, error } = useAdminApi("announcements", "/admin/announcements");
  const create = useAdminMutation(
    () => adminApi.post("/admin/announcements", { ...form, body: form.body || undefined, endAt: form.endAt ? new Date(`${form.endAt}T23:59:59+06:00`) : undefined }),
    { invalidate: ["announcements"], onSuccess: () => setForm({ title: "", body: "", type: "info", endAt: "" }) },
  );
  const toggle = useAdminMutation(({ id, isActive }) => adminApi.patch(`/admin/announcements/${id}`, { isActive }), { invalidate: ["announcements"] });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <PageHeader title="Announcements" subtitle="Banner shown on every ISP's dashboard (maintenance, new features, price changes)" />
      <Card title="New announcement">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Title" required className="sm:col-span-2" value={form.title} onChange={set("title")} />
          <Select label="Type" value={form.type} onChange={set("type")} options={[{ value: "info", label: "Info" }, { value: "warning", label: "Warning" }, { value: "success", label: "Good news" }]} />
          <Textarea label="Details" className="sm:col-span-2" value={form.body} onChange={set("body")} />
          <Input label="Show until (optional)" type="date" value={form.endAt} onChange={set("endAt")} />
        </div>
        <Button className="mt-4" disabled={form.title.trim().length < 3} loading={create.isPending} onClick={() => create.mutate()}>
          Publish
        </Button>
      </Card>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <Table
          rows={data?.data ?? []}
          empty="No announcements."
          columns={[
            { key: "title", header: "Title", render: (a) => <strong>{a.title}</strong> },
            { key: "type", header: "Type", render: (a) => <Badge color={{ info: "blue", warning: "amber", success: "green" }[a.type]}>{a.type}</Badge> },
            { key: "audience", header: "Audience", render: (a) => (a.plans?.length ? a.plans.map((p) => p.name).join(", ") : "All ISPs") },
            { key: "startAt", header: "From", render: (a) => formatDateTime(a.startAt) },
            { key: "endAt", header: "Until", render: (a) => (a.endAt ? formatDateTime(a.endAt) : "—") },
            {
              key: "actions",
              header: "",
              render: (a) => (
                <Button size="sm" variant={a.isActive ? "danger" : "success"} onClick={() => toggle.mutate({ id: a._id, isActive: !a.isActive })}>
                  {a.isActive ? "Hide" : "Show"}
                </Button>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
