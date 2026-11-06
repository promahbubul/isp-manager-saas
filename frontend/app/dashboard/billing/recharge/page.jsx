"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import toast from "react-hot-toast";
import { Button, Card, ErrorBox, InfoList, Input, Loading, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui";
import { api, applyFieldErrors, getErrorMessage } from "@/lib/api";
import { formatDate, taka } from "@/lib/format";
import { useApi } from "@/lib/hooks";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "rocket", label: "Rocket" },
  { value: "bank", label: "Bank" },
];

/** Mirrors backend calculateRecharge() for the live preview. */
function preview(c, months, discount, amount) {
  const bill = Math.max(0, months * Math.max(0, c.monthlyFee - c.discount) - discount);
  const totalDue = c.dueAmount + bill;
  const payable = Math.max(0, totalDue - c.balance);
  const paid = amount === "" || amount === undefined ? payable : Number(amount);
  const available = paid + c.balance;
  return { bill, totalDue, payable, paid, dueAfter: Math.max(0, totalDue - available), advance: Math.max(0, available - totalDue) };
}

function CustomerSearch({ onPick }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const results = useApi(["customers", { search: debounced, limit: 8 }], "/customers", { search: debounced, limit: 8 }, { enabled: debounced.length >= 2 });

  return (
    <Card title="Find customer">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name, mobile, customer ID or PPPoE username"
        className="w-full rounded-md border border-slate-300 px-3 py-2"
      />
      <div className="mt-3 divide-y divide-slate-100">
        {(results.data?.data ?? []).map((c) => (
          <button
            key={c._id}
            type="button"
            onClick={() => onPick(c._id)}
            className="flex w-full cursor-pointer items-center justify-between px-2 py-2 text-left hover:bg-purple-50"
          >
            <span>
              <strong>{c.name}</strong> <span className="text-slate-500">· {c.customerId} · {c.pppoe.username} · {c.phone}</span>
            </span>
            <StatusBadge status={c.status} />
          </button>
        ))}
        {debounced.length >= 2 && results.isSuccess && results.data.data.length === 0 && <p className="p-2 text-slate-500">No match.</p>}
      </div>
    </Card>
  );
}

function RechargeForm({ customerId, onClear }) {
  const router = useRouter();
  const { data, isLoading, error } = useApi(["customer", customerId], `/customers/${customerId}`);
  const { register, handleSubmit, control, setError, formState } = useForm({
    defaultValues: { months: 1, discount: 0, amount: "", method: "cash", trxId: "", note: "" },
  });
  const [months, discount, amount, method] = useWatch({ control, name: ["months", "discount", "amount", "method"] });
  const c = data?.data;
  const calc = useMemo(() => (c ? preview(c, Number(months) || 0, Number(discount) || 0, amount) : null), [c, months, discount, amount]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const onSubmit = async (v) => {
    try {
      const res = await api.post("/payments/recharge", {
        customer: customerId,
        months: Number(v.months),
        discount: Number(v.discount || 0),
        ...(v.amount === "" ? {} : { amount: Number(v.amount) }),
        method: v.method,
        trxId: v.trxId || undefined,
        note: v.note || undefined,
      });
      const msg = res.data.message;
      if (/sync failed/i.test(msg)) toast.error(msg, { duration: 7000 });
      else toast.success(msg);
      router.push(`/dashboard/billing/receipt/${res.data.data.payment._id}`);
    } catch (err) {
      if (!applyFieldErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  };

  const base = new Date(c.expiryDate) > new Date() ? new Date(c.expiryDate) : new Date();
  const newExpiry = new Date(base.getTime() + (Number(months) || 0) * (c.package?.validityDays ?? 30) * 86_400_000);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title="Customer" actions={<Button size="sm" variant="ghost" onClick={onClear}>Change</Button>}>
        <InfoList
          items={[
            { label: "Name", value: `${c.name} (${c.customerId})` },
            { label: "Username", value: c.pppoe.username },
            { label: "Package", value: c.package?.name },
            { label: "Status", value: <StatusBadge status={c.status} /> },
            { label: "Current expiry", value: formatDate(c.expiryDate) },
            { label: "Monthly bill", value: taka(c.monthlyFee - c.discount) },
            { label: "Previous due", value: taka(c.dueAmount) },
            { label: "Advance", value: taka(c.balance) },
          ]}
        />
        {c.status === "disabled" && (
          <p className="mt-4 text-sm text-amber-700">This customer is manually disabled and stays disabled after the recharge.</p>
        )}
      </Card>

      <Card title="Recharge">
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Months" type="number" min={1} max={24} required error={formState.errors.months?.message} {...register("months")} />
          <Input label="Discount (৳)" type="number" step="0.01" error={formState.errors.discount?.message} {...register("discount")} />
          <Input
            label="Amount received (৳)"
            type="number"
            step="0.01"
            placeholder={calc ? String(calc.payable) : ""}
            hint="Empty = full payable amount"
            error={formState.errors.amount?.message}
            {...register("amount")}
          />
          <Select label="Method" options={METHODS} {...register("method")} />
          {method !== "cash" && (
            <Input label="Transaction ID" required={method !== "bank"} error={formState.errors.trxId?.message} {...register("trxId")} className="sm:col-span-2" />
          )}
          <Textarea label="Note" className="sm:col-span-2" {...register("note")} />

          {calc && (
            <div className="space-y-1 rounded-md bg-slate-50 p-4 text-sm sm:col-span-2">
              <Row label="This bill" value={taka(calc.bill)} />
              <Row label="+ Previous due" value={taka(c.dueAmount)} />
              <Row label="− Advance" value={taka(c.balance)} />
              <Row label="Payable" value={taka(calc.payable)} bold />
              <Row label="Received" value={taka(calc.paid)} />
              {calc.dueAfter > 0 && <Row label="Due after" value={taka(calc.dueAfter)} tone="text-red-600" />}
              {calc.advance > 0 && <Row label="Advance after" value={taka(calc.advance)} tone="text-emerald-700" />}
              <Row label="New expiry" value={formatDate(newExpiry)} bold />
            </div>
          )}

          <Button type="submit" variant="success" size="lg" className="sm:col-span-2" loading={formState.isSubmitting}>
            Confirm recharge
          </Button>
        </form>
      </Card>
    </div>
  );
}

const Row = ({ label, value, bold, tone = "" }) => (
  <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${tone}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

function RechargeContent() {
  const params = useSearchParams();
  const router = useRouter();
  const customerId = params.get("customer");
  const pick = (id) => router.replace(id ? `/dashboard/billing/recharge?customer=${id}` : "/dashboard/billing/recharge");

  return (
    <div>
      <PageHeader title="Recharge" subtitle="Collect payment and extend the connection" />
      {customerId ? <RechargeForm key={customerId} customerId={customerId} onClear={() => pick(null)} /> : <CustomerSearch onPick={pick} />}
    </div>
  );
}

export default function RechargePage() {
  return (
    <Suspense fallback={<Loading />}>
      <RechargeContent />
    </Suspense>
  );
}
