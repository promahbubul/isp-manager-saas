"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, ErrorBox, Input, Loading, PageHeader, Pagination, Select, Table } from "@/components/ui";
import { formatDate, formatDateTime, taka, toDateInput } from "@/lib/format";

import { usePaged } from "@/lib/usePaged";

const METHODS = ["cash", "bkash", "nagad", "rocket", "bank", "online"].map((m) => ({ value: m, label: m }));

export default function PaymentsPage() {
  const today = toDateInput(new Date());
  const [filters, setFilters] = useState({ from: today, to: today, method: "", page: 1 });
  const list = usePaged("payments", "/payments", { ...filters, page: undefined });
  const { data, isLoading, error } = list;
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value, page: 1 }));

  return (
    <div>
      <PageHeader title="Payment history" />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Input label="From" type="date" value={filters.from} onChange={set("from")} />
        <Input label="To" type="date" value={filters.to} onChange={set("to")} />
        <Select label="Method" placeholder="All methods" options={METHODS} value={filters.method} onChange={set("method")} />
        <Card className="self-end">
          <p className="text-sm text-zinc-500">Total collected</p>
          <p className="text-xl font-bold text-emerald-700">{taka(data?.totals?.amount)}</p>
          <p className="text-xs text-zinc-500">{data?.totals?.count ?? 0} payment(s)</p>
        </Card>
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={data?.data ?? []}
            columns={[
              {
                key: "receiptNo",
                header: "Receipt",
                render: (p) => (
                  <Link className="text-primary-700 hover:underline" href={`/dashboard/billing/receipt/${p._id}`}>
                    {p.receiptNo}
                  </Link>
                ),
              },
              { key: "createdAt", header: "Date", render: (p) => formatDateTime(p.createdAt) },
              {
                key: "customer",
                header: "Customer",
                render: (p) =>
                  p.customer ? (
                    <Link className="hover:underline" href={`/dashboard/customers/${p.customer._id}`}>
                      {p.customer.name} <span className="text-zinc-500">({p.customer.customerId})</span>
                    </Link>
                  ) : (
                    "—"
                  ),
              },
              { key: "amount", header: "Paid", render: (p) => <strong>{taka(p.amount)}</strong> },
              { key: "months", header: "Months" },
              { key: "method", header: "Method", render: (p) => `${p.method}${p.trxId ? ` · ${p.trxId}` : ""}` },
              { key: "dueAfter", header: "Due after", render: (p) => (p.dueAfter ? taka(p.dueAfter) : "—") },
              { key: "newExpiry", header: "Valid until", render: (p) => formatDate(p.newExpiry) },
              { key: "receivedBy", header: "Collected by", render: (p) => p.receivedBy?.name },
            ]}
          />
          <Pagination {...list.pager} />
        </>
      )}
    </div>
  );
}
