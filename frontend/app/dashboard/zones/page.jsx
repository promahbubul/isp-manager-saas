"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import PermissionGate from "@/components/common/PermissionGate";
import { Button, ErrorBox, Input, Loading, Modal, PageHeader, Select, Table, Textarea, confirmDialog } from "@/components/ui";
import { api, applyFieldErrors } from "@/lib/api";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

function ZoneForm({ zone, zones, onDone }) {
  const { register, handleSubmit, setError, formState } = useForm({
    defaultValues: { name: zone?.name ?? "", parent: zone?.parent ?? "", note: zone?.note ?? "" },
  });
  const save = useApiMutation(
    (body) => (zone ? api.patch(`/zones/${zone._id}`, body) : api.post("/zones", body)),
    { invalidate: ["zones"], onSuccess: onDone },
  );
  const parents = zones.filter((z) => !z.parent && z._id !== zone?._id);

  const onSubmit = (v) =>
    save.mutateAsync({ ...v, parent: v.parent || null }).catch((err) => applyFieldErrors(err, setError));

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Input label="Zone name" required error={formState.errors.name?.message} {...register("name")} />
      <Select
        label="Parent zone"
        hint="Leave empty for a main zone"
        placeholder="— Main zone —"
        options={parents.map((z) => ({ value: z._id, label: z.name }))}
        {...register("parent")}
      />
      <Textarea label="Note" {...register("note")} />
      <div className="flex justify-end gap-2">
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

export default function ZonesPage() {
  const { can } = useAuth();
  const [editing, setEditing] = useState(null); // null | {} (new) | zone
  const { data, isLoading, error } = useApi("zones", "/zones");
  const remove = useApiMutation((id) => api.delete(`/zones/${id}`), { invalidate: ["zones"] });

  const zones = data?.data ?? [];
  const nameOf = Object.fromEntries(zones.map((z) => [z._id, z.name]));
  // Show sub-zones right under their parent.
  const ordered = zones
    .filter((z) => !z.parent)
    .flatMap((p) => [p, ...zones.filter((z) => z.parent === p._id)]);

  return (
    <div>
      <PageHeader
        title="Zones"
        subtitle="Areas used to group customers and assign collectors"
        actions={
          <PermissionGate perm="zone.manage">
            <Button onClick={() => setEditing({})}>+ Add zone</Button>
          </PermissionGate>
        }
      />
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <Table
          rows={ordered}
          empty="No zones yet. Add your first area."
          columns={[
            {
              key: "name",
              header: "Name",
              render: (z) => (z.parent ? <span className="pl-6 text-zinc-600">↳ {z.name}</span> : <strong>{z.name}</strong>),
            },
            { key: "parent", header: "Parent", render: (z) => nameOf[z.parent] ?? "—" },
            { key: "customerCount", header: "Customers" },
            { key: "note", header: "Note" },
            {
              key: "actions",
              header: "",
              className: "text-right",
              render: (z) =>
                can("zone.manage") && (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(z)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => confirmDialog(`Delete zone "${z.name}"?`).then((ok) => ok && remove.mutate(z._id))}
                    >
                      Delete
                    </Button>
                  </div>
                ),
            },
          ]}
        />
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?._id ? "Edit zone" : "Add zone"}>
        {editing !== null && <ZoneForm zone={editing._id ? editing : null} zones={zones} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
