"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Badge, Button, Checkbox, ErrorBox, Input, Loading, Modal, PageHeader, Table, Textarea } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminApi, useAdminMutation } from "@/lib/adminHooks";
import { applyFieldErrors } from "@/lib/api";
import { taka } from "@/lib/format";

const FEATURES = ["online_payment", "customer_portal", "ticket", "reseller", "inventory", "ip_log", "custom_domain", "own_sms_gateway", "api_access", "white_label"];
const lim = (n) => (n === -1 ? "∞" : n);

function PlanForm({ plan, onDone }) {
  const { register, handleSubmit, setError, formState } = useForm({
    defaultValues: plan
      ? { ...plan, features: plan.features ?? [] }
      : {
          name: "",
          slug: "",
          description: "",
          priceBDT: { monthly: 0, yearly: 0 },
          priceUSD: { monthly: 0, yearly: 0 },
          limits: { customers: 100, routers: 1, staff: 3, resellers: 0 },
          features: [],
          isPublic: true,
          isActive: true,
          sortOrder: 10,
        },
  });
  const save = useAdminMutation((body) => (plan ? adminApi.patch(`/admin/plans/${plan._id}`, body) : adminApi.post("/admin/plans", body)), {
    invalidate: ["plans"],
    onSuccess: onDone,
  });
  const e = formState.errors;
  const n = (v) => Number(v);

  const onSubmit = (v) => {
    const body = {
      name: v.name,
      description: v.description,
      priceBDT: { monthly: n(v.priceBDT.monthly), yearly: n(v.priceBDT.yearly) },
      priceUSD: { monthly: n(v.priceUSD.monthly), yearly: n(v.priceUSD.yearly) },
      limits: { customers: n(v.limits.customers), routers: n(v.limits.routers), staff: n(v.limits.staff), resellers: n(v.limits.resellers ?? 0) },
      features: Array.isArray(v.features) ? v.features : v.features ? [v.features] : [],
      isPublic: v.isPublic,
      isActive: v.isActive,
      sortOrder: n(v.sortOrder),
      ...(plan ? {} : { slug: v.slug }),
    };
    return save.mutateAsync(body).catch((err) => applyFieldErrors(err, setError));
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Input label="Name" required className="col-span-2" error={e.name?.message} {...register("name")} />
      <Input label="Slug" required disabled={Boolean(plan)} className="col-span-2" error={e.slug?.message} {...register("slug")} />
      <Textarea label="Description" className="col-span-2 sm:col-span-4" {...register("description")} />
      <Input label="৳ / month" type="number" {...register("priceBDT.monthly")} />
      <Input label="৳ / year" type="number" {...register("priceBDT.yearly")} />
      <Input label="$ / month" type="number" step="0.01" {...register("priceUSD.monthly")} />
      <Input label="$ / year" type="number" step="0.01" {...register("priceUSD.yearly")} />
      <Input label="Customers (-1 = ∞)" type="number" {...register("limits.customers")} />
      <Input label="Routers" type="number" {...register("limits.routers")} />
      <Input label="Staff" type="number" {...register("limits.staff")} />
      <Input label="Sort order" type="number" {...register("sortOrder")} />
      <div className="col-span-2 sm:col-span-4">
        <p className="mb-1 text-sm font-semibold text-slate-700">Features</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Checkbox key={f} id={`f-${f}`} label={f.replace(/_/g, " ")} value={f} {...register("features")} />
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">Shown on pricing; feature gating per plan is not enforced yet.</p>
      </div>
      <div className="col-span-2 flex gap-6 sm:col-span-4">
        <Checkbox label="Public (shown on pricing)" {...register("isPublic")} />
        <Checkbox label="Active (can be bought)" {...register("isActive")} />
      </div>
      <div className="col-span-2 flex justify-end gap-2 sm:col-span-4">
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

export default function AdminPlansPage() {
  const [editing, setEditing] = useState(null);
  const { data, isLoading, error } = useAdminApi("plans", "/admin/plans");
  return (
    <div>
      <PageHeader title="Plans" subtitle="Changing a price affects new purchases and renewals, not periods already paid." actions={<Button onClick={() => setEditing({})}>+ New plan</Button>} />
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <Table
          rows={data?.data ?? []}
          onRowClick={(p) => !p.isTrial && setEditing(p)}
          columns={[
            { key: "name", header: "Plan", render: (p) => <strong>{p.name}</strong> },
            { key: "price", header: "Monthly", render: (p) => (p.priceBDT.monthly ? `${taka(p.priceBDT.monthly)} · $${p.priceUSD.monthly}` : "—") },
            { key: "limits", header: "Customers / routers / staff", render: (p) => `${lim(p.limits.customers)} / ${lim(p.limits.routers)} / ${lim(p.limits.staff)}` },
            { key: "subscribers", header: "ISPs" },
            {
              key: "flags",
              header: "",
              render: (p) => (
                <span className="flex gap-1">
                  {p.isTrial && <Badge color="blue">trial</Badge>}
                  {!p.isPublic && !p.isTrial && <Badge color="slate">hidden</Badge>}
                  {!p.isActive && <Badge color="red">inactive</Badge>}
                </span>
              ),
            },
          ]}
        />
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?._id ? `Edit ${editing.name}` : "New plan"} size="lg">
        {editing !== null && <PlanForm plan={editing._id ? editing : null} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
