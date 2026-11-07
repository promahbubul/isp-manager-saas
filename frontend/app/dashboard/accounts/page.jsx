"use client";

import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import QuickForm from "@/components/common/QuickForm";
import { Badge, Button, Card, ErrorBox, Input, Loading, PageHeader, Select, Stat, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, taka, toDateInput } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";
import { usePaged } from "@/lib/usePaged";
import { IncomeExpenseChart } from "@/components/charts/Charts";

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
          <p className="text-sm text-zinc-500">No data yet.</p>
        ) : (
          <IncomeExpenseChart data={p.monthly} />
        )}
        <p className="mt-3 text-xs text-zinc-500">Income = customer bills + other income. Payments taken by resellers are counted when the reseller deposits.</p>
      </Card>
    </div>
  );
}

function CashBook({ range }) {
  const { data, isLoading, error } = useApi(["cashbook", range], "/accounts/cashbook", range);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const c = data.data;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Opening cash" value={taka(c.opening)} />
        <Stat label="Cash in" value={taka(c.totalIn)} tone="green" />
        <Stat label="Cash out" value={taka(c.totalOut)} tone="red" />
        <Stat label="Closing cash" value={taka(c.closing)} />
      </div>
      <Table
        rowKey="date"
        rows={c.rows}
        empty="No cash movement in this period."
        columns={[
          { key: "date", header: "Date" },
          { key: "lines", header: "Details", className: "whitespace-normal", render: (r) => r.lines.map((l, i) => <div key={i} className={l.kind === "in" ? "text-emerald-700" : "text-rose-700"}>{`${l.kind === "in" ? "+" : "−"} ${taka(l.amount)} ${l.text}`}</div>) },
          { key: "in", header: "In", render: (r) => taka(r.in) },
          { key: "out", header: "Out", render: (r) => taka(r.out) },
          { key: "balance", header: "Balance", render: (r) => <strong>{taka(r.balance)}</strong> },
        ]}
      />
      <p className="text-xs text-zinc-500">Only cash: bKash, bank and online payments are not in the cash book. Handovers between staff do not change company cash.</p>
    </div>
  );
}

function Entries({ range }) {
  const [q, setQ] = useState({ type: "", page: 1 });
  const [adding, setAdding] = useState(null);
  const list = usePaged("ledger", "/accounts/entries", { ...range, ...q, page: undefined });
  const { data, isLoading, error } = list;
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
          <p className="text-sm text-zinc-600">
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
          <Table pager={list.pager}
            indexOffset={list.indexOffset}
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
        <div className="flex rounded-md border border-zinc-300 bg-surface p-0.5">
          {[
            ["pnl", "Profit & loss"],
            ["entries", "Income & expenses"],
            ["cash", "Cash book"],
          ].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`cursor-pointer rounded px-3 py-1.5 text-sm ${tab === k ? "bg-primary-700 text-white" : "text-zinc-700"}`}>
              {l}
            </button>
          ))}
        </div>
        <Input label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Input label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </div>
      {tab === "pnl" ? <ProfitLoss range={range} /> : tab === "cash" ? <CashBook range={range} /> : <Entries range={range} />}
    </div>
  );
}
