"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Badge, Button, Checkbox, ErrorBox, Input, Loading, Modal, PageHeader, Select, Table } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminApi, useAdminMutation } from "@/lib/adminHooks";
import { applyFieldErrors } from "@/lib/api";
import { formatDate } from "@/lib/format";

function CouponForm({ onDone }) {
  const plans = useAdminApi("public-plans", "/public/plans");
  const { register, handleSubmit, setError, formState } = useForm({
    defaultValues: { type: "percent", value: 10, maxUses: 0, oncePerCompany: true, monthly: true, yearly: true, plans: [] },
  });
  const save = useAdminMutation((body) => adminApi.post("/admin/coupons", body), { invalidate: ["coupons"], onSuccess: onDone });
  const e = formState.errors;

  const onSubmit = ({ monthly, yearly, validFrom, validTo, plans: p, ...v }) =>
    save
      .mutateAsync({
        ...v,
        value: Number(v.value),
        maxUses: Number(v.maxUses),
        intervals: [monthly && "monthly", yearly && "yearly"].filter(Boolean),
        plans: Array.isArray(p) ? p : p ? [p] : [],
        ...(validFrom ? { validFrom: new Date(`${validFrom}T00:00:00+06:00`) } : {}),
        ...(validTo ? { validTo: new Date(`${validTo}T23:59:59+06:00`) } : {}),
      })
      .catch((err) => applyFieldErrors(err, setError));

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Input label="Code" required placeholder="LAUNCH20" error={e.code?.message} {...register("code")} />
      <Input label="Description" error={e.description?.message} {...register("description")} />
      <Select label="Type" options={[{ value: "percent", label: "Percent off" }, { value: "fixed", label: "Fixed ৳ off (BDT only)" }]} {...register("type")} />
      <Input label="Value" type="number" step="0.01" required error={e.value?.message} {...register("value")} />
      <Input label="Max uses (0 = unlimited)" type="number" {...register("maxUses")} />
      <div className="flex flex-col gap-2 pt-6">
        <Checkbox label="Once per ISP" {...register("oncePerCompany")} />
      </div>
      <Input label="Valid from" type="date" {...register("validFrom")} />
      <Input label="Valid until" type="date" error={e.validTo?.message} {...register("validTo")} />
      <div className="flex gap-4">
        <Checkbox label="Monthly" {...register("monthly")} />
        <Checkbox label="Yearly" {...register("yearly")} />
      </div>
      <div className="sm:col-span-2">
        <p className="mb-1 text-sm font-semibold text-zinc-700">Plans (none selected = all plans)</p>
        <div className="flex flex-wrap gap-4">
          {(plans.data?.data ?? []).map((p) => (
            <Checkbox key={p._id} id={`plan-${p._id}`} label={p.name} value={p._id} {...register("plans")} />
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Create coupon
        </Button>
      </div>
    </form>
  );
}

export default function AdminCouponsPage() {
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useAdminApi("coupons", "/admin/coupons");
  const toggle = useAdminMutation(({ id, isActive }) => adminApi.patch(`/admin/coupons/${id}`, { isActive }), { invalidate: ["coupons"] });

  return (
    <div>
      <PageHeader title="Coupons" subtitle="Discounts ISPs can apply when paying for a plan" actions={<Button onClick={() => setCreating(true)}>+ New coupon</Button>} />
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <Table
          rows={data?.data ?? []}
          empty="No coupons yet."
          columns={[
            { key: "code", header: "Code", render: (c) => <code className="font-bold">{c.code}</code> },
            { key: "value", header: "Discount", render: (c) => (c.type === "percent" ? `${c.value}%` : `৳${c.value}`) },
            { key: "plans", header: "Plans", render: (c) => (c.plans?.length ? c.plans.map((p) => p.name).join(", ") : "All") },
            { key: "intervals", header: "Billing", render: (c) => c.intervals.join(", ") },
            { key: "used", header: "Used", render: (c) => `${c.used}${c.maxUses ? ` / ${c.maxUses}` : ""}` },
            { key: "validTo", header: "Valid until", render: (c) => (c.validTo ? formatDate(c.validTo) : "—") },
            { key: "isActive", header: "Status", render: (c) => <Badge color={c.isActive ? "green" : "slate"}>{c.isActive ? "active" : "off"}</Badge> },
            {
              key: "actions",
              header: "",
              render: (c) => (
                <Button size="sm" variant={c.isActive ? "danger" : "success"} onClick={() => toggle.mutate({ id: c._id, isActive: !c.isActive })}>
                  {c.isActive ? "Disable" : "Enable"}
                </Button>
              ),
            },
          ]}
        />
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="New coupon" size="lg">
        {creating && <CouponForm onDone={() => setCreating(false)} />}
      </Modal>
    </div>
  );
}
