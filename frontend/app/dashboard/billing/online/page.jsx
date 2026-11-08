"use client";

import Link from "next/link";
import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import { Badge, Button, ErrorBox, Loading, PageHeader, Select, Table, confirmDialog } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime, taka, methodLabel } from "@/lib/format";
import { useApiMutation } from "@/lib/hooks";
import { usePaged } from "@/lib/usePaged";

const STATUS_COLOR = { success: "green", pending_review: "amber", initiated: "slate", failed: "red", cancelled: "slate" };
const STATUSES = ["pending_review", "success", "failed", "cancelled", "initiated"].map((s) => ({ value: s, label: s.replace("_", " ") }));

export default function OnlinePaymentsPage() {
  const [q, setQ] = useState({ status: "pending_review", gateway: "", page: 1 });
  const list = usePaged("online-payments", "/online-payments", { ...q, page: undefined });
  const { data, isLoading, error } = list;
  const invalidate = ["online-payments", "customers", "payments", "dashboard"];
  const approve = useApiMutation((id) => api.post(`/online-payments/${id}/approve`), { invalidate });
  const reject = useApiMutation(({ id, reason }) => api.post(`/online-payments/${id}/reject`, { reason }), { invalidate });
  const set = (k) => (e) => setQ((s) => ({ ...s, [k]: e.target.value, page: 1 }));

  return (
    <div>
      <PageHeader title="Online payments" subtitle="Bills paid by customers through your payment link. Verify manual (Send Money) payments here." />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select placeholder="All statuses" options={STATUSES} value={q.status} onChange={set("status")} />
        <Select
          placeholder="All methods"
          options={["sslcommerz", "bkash", "stripe", "manual"].map((g) => ({ value: g, label: g }))}
          value={q.gateway}
          onChange={set("gateway")}
        />
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table pager={list.pager}
            indexOffset={list.indexOffset}
            rows={data?.data ?? []}
            empty={q.status === "pending_review" ? "Nothing waiting for verification." : "No payments."}
            columns={[
              { key: "createdAt", header: "Time", render: (a) => formatDateTime(a.createdAt) },
              {
                key: "customer",
                header: "Customer",
                render: (a) =>
                  a.refs?.customer ? (
                    <Link className="hover:underline" href={`/dashboard/customers/${a.refs.customer._id}`}>
                      {a.refs.customer.name} ({a.refs.customer.customerId})
                    </Link>
                  ) : (
                    "—"
                  ),
              },
              { key: "amount", header: "Amount", render: (a) => <strong>{taka(a.amount)}</strong> },
              { key: "months", header: "Months", render: (a) => a.refs?.months ?? 1 },
              {
                key: "gateway",
                header: "Method",
                render: (a) => (a.gateway === "manual" ? `${methodLabel(a.manual?.method ?? "manual")} (Send Money)` : methodLabel(a.gateway)),
              },
              { key: "trx", header: "TrxID / sender", render: (a) => [a.gatewayTrxId, a.manual?.senderNumber].filter(Boolean).join(" · ") || "—" },
              { key: "status", header: "Status", render: (a) => <Badge color={STATUS_COLOR[a.status]}>{a.status.replace("_", " ")}</Badge> },
              {
                key: "receipt",
                header: "Receipt",
                render: (a) =>
                  a.payment ? (
                    <Link className="text-primary-700 hover:underline" href={`/dashboard/billing/receipt/${a.payment._id}`}>
                      {a.payment.receiptNo}
                    </Link>
                  ) : (
                    a.failureReason ?? "—"
                  ),
              },
              {
                key: "actions",
                header: "",
                render: (a) =>
                  a.status === "pending_review" && (
                    <PermissionGate perm="payment.recharge">
                      <div className="flex gap-2">
                        <Button size="sm" variant="success" onClick={() => confirmDialog(`Approve ${a.amount} Tk (TrxID ${a.gatewayTrxId})? The customer will be recharged.`).then((ok) => ok && approve.mutate(a._id))}>
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            const reason = prompt("Reason for rejecting?", "Transaction not found");
                            if (reason !== null) reject.mutate({ id: a._id, reason });
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    </PermissionGate>
                  ),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
