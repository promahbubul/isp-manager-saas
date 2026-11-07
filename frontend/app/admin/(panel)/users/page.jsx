"use client";

import { useState } from "react";
import { Badge, Button, Card, ErrorBox, Input, Loading, PageHeader, Select, Table } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminApi, useAdminMutation } from "@/lib/adminHooks";
import { formatDateTime } from "@/lib/format";

const ROLES = [
  { value: "support", label: "Support — read ISPs, payments, audit" },
  { value: "finance", label: "Finance — read + approve payments, SMS credits" },
  { value: "super_admin", label: "Super admin — everything" },
];

export default function AdminUsersPage() {
  const [form, setForm] = useState({ name: "", email: "", role: "support", password: "" });
  const { data, isLoading, error } = useAdminApi("platform-users", "/admin/platform-users");
  const create = useAdminMutation(() => adminApi.post("/admin/platform-users", form), {
    invalidate: ["platform-users"],
    onSuccess: () => setForm({ name: "", email: "", role: "support", password: "" }),
  });
  const update = useAdminMutation(({ id, ...body }) => adminApi.patch(`/admin/platform-users/${id}`, body), { invalidate: ["platform-users"] });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <PageHeader title="Platform admins" subtitle="Your own staff. Ask everyone to turn on two-factor authentication." />
      <Card title="Add admin">
        <div className="grid gap-4 sm:grid-cols-4">
          <Input label="Name" value={form.name} onChange={set("name")} />
          <Input label="Email" type="email" value={form.email} onChange={set("email")} />
          <Input label="Temporary password" type="password" hint="At least 10 characters" value={form.password} onChange={set("password")} />
          <Select label="Role" value={form.role} onChange={set("role")} options={ROLES} />
        </div>
        <Button className="mt-4" loading={create.isPending} disabled={!form.name || !form.email || form.password.length < 10} onClick={() => create.mutate()}>
          Add
        </Button>
      </Card>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <Table
          rows={data?.data ?? []}
          columns={[
            { key: "name", header: "Name", render: (u) => <strong>{u.name}</strong> },
            { key: "email", header: "Email" },
            { key: "role", header: "Role", render: (u) => <Badge color={u.role === "super_admin" ? "purple" : "blue"}>{u.role}</Badge> },
            { key: "2fa", header: "2FA", render: (u) => (u.twoFactor?.enabled ? <Badge color="green">on</Badge> : <Badge color="amber">off</Badge>) },
            { key: "lastLogin", header: "Last login", render: (u) => formatDateTime(u.lastLogin) },
            {
              key: "actions",
              header: "",
              render: (u) => (
                <Button size="sm" variant={u.isActive ? "danger" : "success"} onClick={() => update.mutate({ id: u._id, isActive: !u.isActive })}>
                  {u.isActive ? "Deactivate" : "Activate"}
                </Button>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
