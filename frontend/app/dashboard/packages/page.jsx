"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import PermissionGate from "@/components/common/PermissionGate";
import { Button, Checkbox, ErrorBox, Input, Loading, Modal, PageHeader, Select, StatusBadge, Table } from "@/components/ui";
import { api, applyFieldErrors } from "@/lib/api";
import { taka } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

function PackageForm({ pkg, routers, onDone }) {
  const { register, handleSubmit, setError, control, formState } = useForm({
    defaultValues: {
      name: pkg?.name ?? "",
      speedDown: pkg?.speedDown ?? "",
      speedUp: pkg?.speedUp ?? "",
      price: pkg?.price ?? "",
      validityDays: pkg?.validityDays ?? 30,
      router: pkg?.router?._id ?? pkg?.router ?? routers[0]?._id ?? "",
      mikrotikProfile: pkg?.mikrotikProfile ?? "",
      isActive: pkg?.isActive ?? true,
    },
  });
  const routerId = useWatch({ control, name: "router" });
  // Profiles come live from the router; typing a name is still possible if it is offline.
  const profiles = useApi(["router-profiles", routerId], `/routers/${routerId}/profiles`, undefined, {
    enabled: Boolean(routerId),
    retry: false,
  });
  const save = useApiMutation((body) => (pkg ? api.patch(`/packages/${pkg._id}`, body) : api.post("/packages", body)), {
    invalidate: ["packages"],
    onSuccess: onDone,
  });
  const e = formState.errors;

  const onSubmit = (v) =>
    save
      .mutateAsync({
        ...v,
        speedDown: Number(v.speedDown),
        speedUp: Number(v.speedUp),
        price: Number(v.price),
        validityDays: Number(v.validityDays),
        ...(pkg ? {} : { isActive: undefined }),
      })
      .catch((err) => applyFieldErrors(err, setError));

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Input label="Package name" required placeholder="10 Mbps Home" error={e.name?.message} {...register("name")} className="sm:col-span-2" />
      <Input label="Download (Mbps)" type="number" required error={e.speedDown?.message} {...register("speedDown")} />
      <Input label="Upload (Mbps)" type="number" required error={e.speedUp?.message} {...register("speedUp")} />
      <Input label="Monthly price (৳)" type="number" step="0.01" required error={e.price?.message} {...register("price")} />
      <Input label="Validity (days)" type="number" required error={e.validityDays?.message} {...register("validityDays")} />
      <Select
        label="Router"
        required
        options={routers.map((r) => ({ value: r._id, label: r.name }))}
        error={e.router?.message}
        {...register("router")}
      />
      <div>
        <Input
          label="MikroTik PPP profile"
          required
          list="profile-options"
          placeholder={profiles.isLoading ? "Loading profiles..." : "e.g. 10M"}
          hint={profiles.isError ? "Router offline — type the profile name" : "Pick from the router's /ppp profile list"}
          error={e.mikrotikProfile?.message}
          {...register("mikrotikProfile")}
        />
        <datalist id="profile-options">
          {(profiles.data?.data ?? []).map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
      {pkg && (
        <div className="sm:col-span-2">
          <Checkbox label="Active" hint="Inactive packages cannot be given to new customers" {...register("isActive")} />
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

export default function PackagesPage() {
  const { can } = useAuth();
  const [editing, setEditing] = useState(null);
  const { data, isLoading, error } = useApi("packages", "/packages");
  const routers = useApi("routers", "/routers", undefined, { enabled: can("router.view") });
  const remove = useApiMutation((id) => api.delete(`/packages/${id}`), { invalidate: ["packages"] });
  const routerList = routers.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Packages"
        subtitle="Internet plans and their MikroTik PPP profiles"
        actions={
          <PermissionGate perm="package.manage">
            <Button onClick={() => setEditing({})} disabled={routers.isSuccess && routerList.length === 0}>
              + Add package
            </Button>
          </PermissionGate>
        }
      />
      {routers.isSuccess && routerList.length === 0 && can("package.manage") && (
        <div className="mb-4">
          <ErrorBox>Add a router first — every package is linked to a MikroTik PPP profile.</ErrorBox>
        </div>
      )}
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <Table
          rows={data?.data ?? []}
          empty="No packages yet."
          columns={[
            { key: "name", header: "Name", render: (p) => <strong>{p.name}</strong> },
            { key: "speed", header: "Speed", render: (p) => `${p.speedDown}/${p.speedUp} Mbps` },
            { key: "price", header: "Price", render: (p) => taka(p.price) },
            { key: "validityDays", header: "Validity", render: (p) => `${p.validityDays} days` },
            { key: "router", header: "Router", render: (p) => p.router?.name ?? "—" },
            { key: "mikrotikProfile", header: "Profile" },
            { key: "customerCount", header: "Customers" },
            { key: "isActive", header: "Status", render: (p) => <StatusBadge status={p.isActive ? "active" : "disabled"} /> },
            {
              key: "actions",
              header: "",
              className: "text-right",
              render: (p) =>
                can("package.manage") && (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => confirm(`Delete package "${p.name}"?`) && remove.mutate(p._id)}>
                      Delete
                    </Button>
                  </div>
                ),
            },
          ]}
        />
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?._id ? "Edit package" : "Add package"} size="lg">
        {editing !== null && <PackageForm pkg={editing._id ? editing : null} routers={routerList} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
