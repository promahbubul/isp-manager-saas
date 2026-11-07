"use client";

import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import QuickForm from "@/components/common/QuickForm";
import { Badge, Button, Card, ErrorBox, Input, Loading, PageHeader, Pagination, Select, Stat, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, taka, toDateInput } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";

const METHODS = ["cash", "bank", "bkash", "nagad", "rocket", "other"].map((m) => ({ value: m, label: m }));
const monthStart = () => {
  const d = new Date();
  return toDateInput(new Date(d.getFullYear(), d.getMonth(), 1));
};

function ProfitLoss({ range }) {
  const { data, isLoading, error } = useApi(["pnl", range], "/accounts/pnl", range);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const p = data.data;
  const max = Math.max(1, ...p.monthly.map((m) => Math.max(m.income, m.expense)));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Income" value={taka(p.income.total)} tone="green" />
        <Stat label="Expenses" value={taka(p.expense.total)} tone="red" />
        <Stat label={p.net >= 0 ? "Profit" : "Loss"} value={`${taka(p.net)}${p.margin != null ? ` · ${p.margin}%` : ""}`} tone={p.net >= 0 ? "green" : "red"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Income">
          <Table rowKey="category" rows={p.income.rows} empty="No income." columns={[{ key: "category", header: "Source" }, { key: "amount", header: "Amount", render: (r) => taka(r.amount) }]} />
        </Card>
        <Card title="Expenses">
          <Table rowKey="category" rows={p.expense.rows} empty="No expenses." columns={[{ key: "category", header: "Category" }, { key: "amount", header: "Amount", render: (r) => taka(r.amount) }]} />
        </Card>
      </div>
      <Card title="Last 12 months">
        {p.monthly.length === 0 ? (
          <p className="text-sm text-slate-500">No data yet.</p>
        ) : (
          <ul className="space-y-2">
            {p.monthly.map((m) => (
              <li key={m.month} className="grid grid-cols-[5rem_1fr_7rem] items-center gap-3 text-sm">
                <span className="text-slate-600">{m.month}</span>
                <div className="space-y-1">
                  <div className="h-2 rounded bg-emerald-500" style={{ width: `${(m.income / max) * 100}%` }} title={`Income ${taka(m.income)}`} />
                  <div className="h-2 rounded bg-rose-400" style={{ width: `${(m.expense / max) * 100}%` }} title={`Expense ${taka(m.expense)}`} />
                </div>
                <span className={`text-right font-medium ${m.net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{taka(m.net)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">Green = income (customer bills + other income), red = expenses. Payments taken by resellers are counted when the reseller deposits.</p>
      </Card>
    </div>
  );
}

function Entries({ range }) {
  const [q, setQ] = useState({ type: "", page: 1 });
  const [adding, setAdding] = useState(null);
  const params = Object.fromEntries(Object.entries({ ...range, ...q, limit: 25 }).filter(([, v]) => v !== ""));
  const { data, isLoading, error } = useApi(["ledger", params], "/accounts/entries", params);
  const cats = useApi("ledger-categories", "/accounts/categories");
  const save = useApiMutation((body) => api.post("/accounts/entries", body), { invalidate: ["ledger", "pnl", "ledger-categories"] });
  const remove = useApiMutation((id) => api.delete(`/accounts/entries/${id}`), { invalidate: ["ledger", "pnl"] });
  const totals = data?.data?.totals;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Select value={q.type} onChange={(e) => setQ({ type: e.target.value, page: 1 })} options={[{ value: "", label: "Income + expense" }, { value: "expense", label: "Expenses" }, { value: "income", label: "Other income" }]} />
        </div>
        {totals && (
          <p className="text-sm text-slate-600">
            Income {taka(totals.income)} · Expense {taka(totals.expense)}
          </p>
        )}
        <PermissionGate perm="expense.manage">
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setAdding("income")}>
              + Income
            </Button>
            <Button onClick={() => setAdding("expense")}>+ Expense</Button>
          </div>
        </PermissionGate>
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={data?.data?.entries ?? []}
            empty="Nothing in this period."
            columns={[
              { key: "date", header: "Date", render: (e) => formatDate(e.date) },
              { key: "type", header: "Type", render: (e) => <Badge color={e.type === "expense" ? "red" : "green"}>{e.type}</Badge> },
              { key: "category", header: "Category" },
              { key: "amount", header: "Amount", render: (e) => taka(e.amount) },
              { key: "method", header: "Paid by" },
              { key: "note", header: "Note", className: "max-w-xs truncate" },
              { key: "source", header: "From", render: (e) => (e.source === "manual" ? e.createdBy?.name : <Badge>{e.source.replace("_", " ")}</Badge>) },
              {
                key: "x",
                header: "",
                render: (e) =>
                  e.source === "manual" && (
                    <PermissionGate perm="expense.manage">
                      <Button size="sm" variant="danger" onClick={() => confirm("Delete this entry?") && remove.mutate(e._id)}>
                        Delete
                      </Button>
                    </PermissionGate>
                  ),
              },
            ]}
          />
          <Pagination meta={data?.meta} onPage={(page) => setQ((s) => ({ ...s, page }))} />
        </>
      )}
      {adding && (
        <QuickForm
          title={adding === "expense" ? "Add expense" : "Add other income"}
          loading={save.isPending}
          initial={{ date: toDateInput(new Date()), method: "cash" }}
          fields={[
            { name: "category", label: "Category", type: "select", required: true, placeholder: "— choose —", options: (cats.data?.data?.[adding] ?? []).map((c) => ({ value: c, label: c })) },
            { name: "amount", label: "Amount (৳)", type: "number", required: true },
            { name: "date", label: "Date", type: "date", required: true },
            { name: "method", label: "Paid / received by", type: "select", options: METHODS },
            { name: "note", label: "Note", type: "textarea" },
          ]}
          onSubmit={(v) => save.mutateAsync({ ...v, type: adding, date: new Date(`${v.date}T12:00:00+06:00`) })}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
}

export default function AccountsPage() {
  const [tab, setTab] = useState("pnl");
  const [range, setRange] = useState({ from: monthStart(), to: toDateInput(new Date()) });
  return (
    <div>
      <PageHeader title="Accounts" subtitle="Expenses, other income and profit & loss" />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5">
          {[
            ["pnl", "Profit & loss"],
            ["entries", "Income & expenses"],
          ].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`cursor-pointer rounded px-3 py-1.5 text-sm ${tab === k ? "bg-purple-700 text-white" : "text-slate-700"}`}>
              {l}
            </button>
          ))}
        </div>
        <Input label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Input label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </div>
      {tab === "pnl" ? <ProfitLoss range={range} /> : <Entries range={range} />}
    </div>
  );
}
