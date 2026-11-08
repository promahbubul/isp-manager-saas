"use client";

import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import QuickForm from "@/components/common/QuickForm";
import { Badge, Button, Card, ErrorBox, Input, Loading, PageHeader, Stat, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, taka, toDateInput, methodLabel } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";
import { usePaged } from "@/lib/usePaged";
import { useAuth } from "@/providers/AuthProvider";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const STATUS_COLOR = { paid: "green", partial: "amber", unpaid: "red" };

function SalarySheet() {
  const [month, setMonth] = useState(thisMonth());
  const [paying, setPaying] = useState(null);
  const { data, isLoading, error } = useApi(["salary-sheet", month], "/employees/salary-sheet", { month });
  const pay = useApiMutation((b) => api.post("/employees/salaries", b), { invalidate: ["salary-sheet", "salaries", "pnl", "ledger"] });
  const s = data?.data;

  return (
    <Card title="Salary sheet">
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <Input label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        {s && (
          <div className="grid flex-1 grid-cols-3 gap-3">
            <Stat label="Total salary" value={taka(s.totals.monthlySalary)} />
            <Stat label="Paid" value={taka(s.totals.paid)} tone="green" />
            <Stat label="Remaining" value={taka(s.totals.remaining)} tone="red" />
          </div>
        )}
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <Table
          rowKey="key"
          rows={(s?.rows ?? []).map((r) => ({ ...r, key: r.employee._id }))}
          empty="No active employees."
          columns={[
            { key: "name", header: "Employee", render: (r) => <strong>{r.employee.name}</strong> },
            { key: "designation", header: "Designation", render: (r) => r.employee.designation },
            { key: "monthlySalary", header: "Salary", render: (r) => taka(r.monthlySalary) },
            { key: "advance", header: "Advance", render: (r) => taka(r.advance) },
            { key: "salary", header: "Paid", render: (r) => taka(r.salary) },
            { key: "bonus", header: "Bonus", render: (r) => taka(r.bonus) },
            { key: "deduction", header: "Deduction", render: (r) => taka(r.deduction) },
            { key: "remaining", header: "Remaining", render: (r) => <strong>{taka(r.remaining)}</strong> },
            { key: "status", header: "", render: (r) => <Badge color={STATUS_COLOR[r.status]}>{r.status}</Badge> },
            {
              key: "pay",
              header: "",
              render: (r) => (
                <Button size="sm" onClick={() => setPaying(r)}>
                  Pay
                </Button>
              ),
            },
          ]}
        />
      )}
      {paying && (
        <QuickForm
          title={`Pay ${paying.employee.name} — ${month}`}
          submitLabel="Pay"
          loading={pay.isPending}
          initial={{ type: "salary", amount: paying.remaining || "", method: "cash", paidAt: toDateInput(new Date()) }}
          fields={[
            { name: "type", label: "Type", type: "select", options: [{ value: "salary", label: "Salary" }, { value: "advance", label: "Advance" }, { value: "bonus", label: "Bonus" }] },
            { name: "amount", label: "Amount (৳)", type: "number", required: true },
            { name: "deduction", label: "Deduction (৳)", type: "number", hint: "Late, absence or advance recovery" },
            { name: "method", label: "Paid by", type: "select", options: ["cash", "bank", "bkash", "nagad", "rocket", "other"].map((m) => ({ value: m, label: methodLabel(m) })) },
            { name: "paidAt", label: "Date", type: "date", required: true },
            { name: "note", label: "Note" },
          ]}
          onSubmit={(v) => pay.mutateAsync({ ...v, employee: paying.employee._id, month, paidAt: new Date(`${v.paidAt}T12:00:00+06:00`) })}
          onClose={() => setPaying(null)}
        />
      )}
      <p className="mt-3 text-xs text-zinc-500">Every payment is added to Accounts as a Salary expense automatically.</p>
    </Card>
  );
}

export default function EmployeesPage() {
  const { can } = useAuth();
  const [editing, setEditing] = useState(null);
  const list = usePaged("employees", "/employees", { active: "all" }, { defaultLimit: 50 });
  const { data, isLoading, error } = list;
  const save = useApiMutation((b) => (editing?._id ? api.patch(`/employees/${editing._id}`, b) : api.post("/employees", b)), { invalidate: ["employees", "salary-sheet"] });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        subtitle="Staff records and salary — line men without a login can be added too"
        actions={
          <PermissionGate perm="employee.manage">
            <Button onClick={() => setEditing({})}>+ Add employee</Button>
          </PermissionGate>
        }
      />
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table pager={list.pager}
            rows={data?.data ?? []}
            empty="No employees yet."
            onRowClick={can("employee.manage") ? (e) => setEditing(e) : undefined}
            columns={[
              { key: "name", header: "Name", render: (e) => <strong>{e.name}</strong> },
              { key: "designation", header: "Designation" },
              { key: "phone", header: "Mobile" },
              { key: "monthlySalary", header: "Salary", render: (e) => taka(e.monthlySalary) },
              { key: "joinDate", header: "Joined", render: (e) => formatDate(e.joinDate) },
              { key: "user", header: "Login", render: (e) => e.user?.name ?? "—" },
              { key: "isActive", header: "", render: (e) => <Badge color={e.isActive ? "green" : "slate"}>{e.isActive ? "active" : "left"}</Badge> },
            ]}
          />
        </>
      )}
      {can("employee.salary") && <SalarySheet />}
      {editing && (
        <QuickForm
          title={editing._id ? `Edit ${editing.name}` : "Add employee"}
          loading={save.isPending}
          initial={editing._id ? { ...editing, joinDate: toDateInput(editing.joinDate), user: undefined } : { joinDate: toDateInput(new Date()), isActive: true }}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "phone", label: "Mobile", required: true },
            { name: "designation", label: "Designation", placeholder: "Technician, collector, manager..." },
            { name: "monthlySalary", label: "Monthly salary (৳)", type: "number", required: true },
            { name: "joinDate", label: "Join date", type: "date" },
            { name: "nid", label: "NID" },
            { name: "address", label: "Address" },
            ...(editing._id ? [{ name: "isActive", label: "Still working here", type: "checkbox" }] : []),
          ]}
          onSubmit={(v) => save.mutateAsync({ ...v, joinDate: v.joinDate ? new Date(`${v.joinDate}T12:00:00+06:00`) : undefined })}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
