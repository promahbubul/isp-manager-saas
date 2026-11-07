"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Badge, Button, Checkbox, ErrorBox, Input, Loading, Modal, PageHeader, Select, StatusBadge, Table } from "@/components/ui";
import { api, applyFieldErrors } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

const ROLES = [
  { value: "admin", label: "Admin — everything except subscription" },
  { value: "manager", label: "Manager — customers, billing, tickets" },
  { value: "accountant", label: "Accountant — payments, expenses, reports" },
  { value: "collector", label: "Collector — recharge in assigned zones" },
  { value: "technician", label: "Technician — enable/disable, tickets" },
];

function StaffForm({ staff, zones, onDone }) {
  const { user } = useAuth();
  const { register, handleSubmit, setError, control, formState } = useForm({
    defaultValues: {
      name: staff?.name ?? "",
      phone: staff?.phone ?? "",
      email: staff?.email ?? "",
      role: staff?.role ?? "collector",
      password: "",
      zones: staff?.zones ?? [],
    },
  });
  const save = useApiMutation((body) => (staff ? api.patch(`/users/${staff._id}`, body) : api.post("/users", body)), {
    invalidate: ["users"],
    onSuccess: onDone,
  });
  const e = formState.errors;
  const role = useWatch({ control, name: "role" });
  // Only the owner may create admins.
  const roles = user.role === "owner" ? ROLES : ROLES.filter((r) => r.value !== "admin");

  const onSubmit = ({ password, email, zones: z, ...v }) =>
    save
      .mutateAsync({
        ...v,
        ...(email ? { email } : {}),
        ...(password ? { password } : {}),
        zones: Array.isArray(z) ? z : z ? [z] : [],
      })
      .catch((err) => applyFieldErrors(err, setError));

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Input label="Name" required error={e.name?.message} {...register("name")} />
      <Input label="Mobile" required error={e.phone?.message} {...register("phone")} />
      <Input label="Email" type="email" error={e.email?.message} {...register("email")} />
      <Input
        label="Password"
        type="password"
        required={!staff}
        hint={staff ? "Leave empty to keep the current password" : "Min 8 chars with a letter and a number"}
        error={e.password?.message}
        {...register("password")}
      />
      <Select label="Role" required options={roles} error={e.role?.message} {...register("role")} className="sm:col-span-2" />
      {(role === "collector" || role === "technician") && (
        <div className="sm:col-span-2">
          <p className="mb-1 text-sm font-semibold text-zinc-700">Zones</p>
          <p className="mb-2 text-xs text-zinc-500">No zone selected = can see all customers.</p>
          <div className="grid grid-cols-2 gap-2">
            {zones.map((z) => (
              <Checkbox key={z._id} id={`zone-${z._id}`} label={z.name} value={z._id} {...register("zones")} />
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

export default function StaffPage() {
  const { user } = useAuth();
  const [editing, setEditing] = useState(null);
  const { data, isLoading, error } = useApi("users", "/users", { limit: 100 });
  const zones = useApi("zones", "/zones");
  const toggle = useApiMutation(({ id, isActive }) => api.patch(`/users/${id}`, { isActive }), { invalidate: ["users"] });
  const zoneName = Object.fromEntries((zones.data?.data ?? []).map((z) => [z._id, z.name]));

  return (
    <div>
      <PageHeader title="Staff" subtitle="Who can log in to your panel" actions={<Button onClick={() => setEditing({})}>+ Add staff</Button>} />
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <Table
          rows={data?.data ?? []}
          columns={[
            { key: "name", header: "Name", render: (s) => <strong>{s.name}</strong> },
            { key: "phone", header: "Mobile" },
            { key: "role", header: "Role", render: (s) => <Badge color={s.role === "owner" ? "purple" : "blue"}>{s.role}</Badge> },
            { key: "zones", header: "Zones", render: (s) => (s.zones?.length ? s.zones.map((z) => zoneName[z] ?? "?").join(", ") : "All") },
            { key: "lastLogin", header: "Last login", render: (s) => formatDateTime(s.lastLogin) },
            { key: "isActive", header: "Status", render: (s) => <StatusBadge status={s.isActive ? "active" : "disabled"} /> },
            {
              key: "actions",
              header: "",
              className: "text-right",
              render: (s) =>
                s.role !== "owner" &&
                s._id !== user._id && (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant={s.isActive ? "danger" : "success"}
                      onClick={() => toggle.mutate({ id: s._id, isActive: !s.isActive })}
                    >
                      {s.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                ),
            },
          ]}
        />
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?._id ? "Edit staff" : "Add staff"} size="lg">
        {editing !== null && <StaffForm staff={editing._id ? editing : null} zones={zones.data?.data ?? []} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
