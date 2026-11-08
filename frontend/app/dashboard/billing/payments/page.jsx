"use client";

import { Eye, RotateCcw, User } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import ExportButton from "@/components/common/ExportButton";
import RefundModal from "@/components/payment/RefundModal";
import { Card, ErrorBox, Input, Loading, PageHeader, RowActions, Select, StatusBadge, Table } from "@/components/ui";
import { formatDate, formatDateTime, methodLabel, taka, toDateInput } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { usePaged } from "@/lib/usePaged";

const METHODS = ["cash", "bkash", "nagad", "rocket", "bank", "online", "sslcommerz", "stripe"].map((m) => ({ value: m, label: methodLabel(m) }));

export default function PaymentsPage() {
  const today = toDateInput(new Date());
  const [filters, setFilters] = useState({ from: today, to: today, method: "", page: 1 });
  const list = usePaged("payments", "/payments", { ...filters, page: undefined });
  const { data, isLoading, error } = list;
  const { can } = useAuth();
  const [refunding, setRefunding] = useState(null);
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value, page: 1 }));

  return (
    <div>
      <PageHeader title="Payment history" actions={<ExportButton report="payments" params={{ from: filters.from, to: filters.to, method: filters.method }} />} />
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
          <Table pager={list.pager}
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
              { key: "method", header: "Method", render: (p) => `${methodLabel(p.method)}${p.trxId ? ` · ${p.trxId}` : ""}` },
              { key: "dueAfter", header: "Due after", render: (p) => (p.dueAfter ? taka(p.dueAfter) : "—") },
              { key: "newExpiry", header: "Valid until", render: (p) => formatDate(p.newExpiry) },
              { key: "receivedBy", header: "Collected by", render: (p) => p.receivedBy?.name ?? (p.source === "online" ? "Online" : "—") },
              { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
              {
                key: "actions",
                header: "",
                render: (p) => (
                  <RowActions
                    items={[
                      { label: "View receipt", icon: Eye, href: `/dashboard/billing/receipt/${p._id}` },
                      { label: "Open customer", icon: User, href: p.customer ? `/dashboard/customers/${p.customer._id}` : undefined, hidden: !p.customer },
                      { label: "Refund", icon: RotateCcw, danger: true, separator: true, onClick: () => setRefunding(p), hidden: !can("payment.refund") || p.status !== "success" },
                    ]}
                  />
                ),
              },
            ]}
          />
        </>
      )}
      {refunding && <RefundModal payment={refunding} onClose={() => setRefunding(null)} />}
    </div>
  );
}
