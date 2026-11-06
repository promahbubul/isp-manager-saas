"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { api, applyFieldErrors } from "@/lib/api";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

export const CATEGORIES = [
  ["no_internet", "No internet"],
  ["slow_speed", "Slow speed"],
  ["fiber_cut", "Fiber cut"],
  ["router_issue", "Router / ONU issue"],
  ["billing", "Billing"],
  ["new_connection", "New connection"],
  ["other", "Other"],
].map(([value, label]) => ({ value, label }));

export const PRIORITIES = ["low", "medium", "high"].map((p) => ({ value: p, label: p }));

/** Customer picker with live search. */
function CustomerPicker({ value, onChange, initial }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState(initial ?? null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const results = useApi(["customers", { search: debounced, limit: 6 }], "/customers", { search: debounced, limit: 6 }, { enabled: debounced.length >= 2 && !value });

  if (value && picked) {
    return (
      <div className="flex items-center justify-between rounded-md border border-slate-300 px-3 py-2">
        <span>
          {picked.name} <span className="text-slate-500">({picked.customerId})</span>
        </span>
        <button type="button" className="cursor-pointer text-sm text-purple-700" onClick={() => { onChange(""); setPicked(null); }}>
          change
        </button>
      </div>
    );
  }
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer (optional)" className="w-full rounded-md border border-slate-300 px-3 py-2" />
      {(results.data?.data ?? []).map((c) => (
        <button key={c._id} type="button" onClick={() => { setPicked(c); onChange(c._id); }} className="block w-full cursor-pointer px-3 py-1.5 text-left text-sm hover:bg-purple-50">
          {c.name} · {c.customerId} · {c.phone}
        </button>
      ))}
    </div>
  );
}

export default function TicketForm({ customer, onDone }) {
  const { can } = useAuth();
  const [customerId, setCustomerId] = useState(customer?._id ?? "");
  const assignees = useApi("ticket-assignees", "/tickets/assignees", undefined, { enabled: can("ticket.assign") });
  const { register, handleSubmit, setError, formState } = useForm({ defaultValues: { category: "no_internet", priority: "medium", source: "phone" } });
  const save = useApiMutation((body) => api.post("/tickets", body), { invalidate: ["tickets", "ticket-counts"], onSuccess: onDone });
  const e = formState.errors;

  const onSubmit = (v) =>
    save
      .mutateAsync({ ...v, customer: customerId || undefined, assignedTo: v.assignedTo || undefined, description: v.description || undefined })
      .catch((err) => applyFieldErrors(err, setError));

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p className="mb-1 text-sm font-semibold text-slate-700">Customer</p>
        <CustomerPicker value={customerId} onChange={setCustomerId} initial={customer} />
      </div>
      <Input label="Subject" required className="sm:col-span-2" error={e.subject?.message} {...register("subject")} />
      <Select label="Category" options={CATEGORIES} {...register("category")} />
      <Select label="Priority" options={PRIORITIES} {...register("priority")} />
      <Select label="Source" options={[{ value: "phone", label: "Phone call" }, { value: "office", label: "Office visit" }]} {...register("source")} />
      {can("ticket.assign") && (
        <Select
          label="Assign to"
          placeholder="— Unassigned —"
          options={(assignees.data?.data ?? []).map((u) => ({ value: u._id, label: `${u.name} (${u.role})` }))}
          {...register("assignedTo")}
        />
      )}
      <Textarea label="Details" className="sm:col-span-2" {...register("description")} />
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Create ticket
        </Button>
      </div>
    </form>
  );
}
