"use client";

import { Eye, EyeOff, Pencil } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, ErrorBox, Input, Loading, PageHeader, RowActions, Select, Table, Textarea } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminApi, useAdminMutation } from "@/lib/adminHooks";
import { formatDateTime, toDateInput } from "@/lib/format";

const EMPTY = { title: "", body: "", type: "info", endAt: "" };

export default function AnnouncementsPage() {
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const { data, isLoading, error } = useAdminApi("announcements", "/admin/announcements");
  const reset = () => (setForm(EMPTY), setEditingId(null));
  const create = useAdminMutation(
    () => {
      const body = { title: form.title, type: form.type, body: form.body || undefined, endAt: form.endAt ? new Date(`${form.endAt}T23:59:59+06:00`) : editingId ? null : undefined };
      return editingId ? adminApi.patch(`/admin/announcements/${editingId}`, body) : adminApi.post("/admin/announcements", body);
    },
    { invalidate: ["announcements"], onSuccess: reset },
  );
  const edit = (a) => {
    setEditingId(a._id);
    setForm({ title: a.title, body: a.body ?? "", type: a.type, endAt: a.endAt ? toDateInput(a.endAt) : "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const toggle = useAdminMutation(({ id, isActive }) => adminApi.patch(`/admin/announcements/${id}`, { isActive }), { invalidate: ["announcements"] });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <PageHeader title="Announcements" subtitle="Banner shown on every ISP's dashboard (maintenance, new features, price changes)" />
      <Card title={editingId ? "Edit announcement" : "New announcement"}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Title" required className="sm:col-span-2" value={form.title} onChange={set("title")} />
          <Select label="Type" value={form.type} onChange={set("type")} options={[{ value: "info", label: "Info" }, { value: "warning", label: "Warning" }, { value: "success", label: "Good news" }]} />
          <Textarea label="Details" className="sm:col-span-2" value={form.body} onChange={set("body")} />
          <Input label="Show until (optional)" type="date" value={form.endAt} onChange={set("endAt")} />
        </div>
        <div className="mt-4 flex gap-2">
          <Button disabled={form.title.trim().length < 3} loading={create.isPending} onClick={() => create.mutate()}>
            {editingId ? "Save changes" : "Publish"}
          </Button>
          {editingId && (
            <Button variant="secondary" onClick={reset}>
              Cancel
            </Button>
          )}
        </div>
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
            { key: "isActive", header: "Status", render: (a) => <Badge color={a.isActive ? "green" : "slate"}>{a.isActive ? "showing" : "hidden"}</Badge> },
            { key: "endAt", header: "Until", render: (a) => (a.endAt ? formatDateTime(a.endAt) : "—") },
            {
              key: "actions",
              header: "",
              render: (a) => (
                <RowActions
                  items={[
                    { label: "Edit", icon: Pencil, onClick: () => edit(a) },
                    { label: a.isActive ? "Hide" : "Show again", icon: a.isActive ? EyeOff : Eye, onClick: () => toggle.mutate({ id: a._id, isActive: !a.isActive }) },
                  ]}
                />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
