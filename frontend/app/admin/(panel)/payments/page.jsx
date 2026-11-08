"use client";

import { useState } from "react";
import { Badge, Button, ErrorBox, Loading, PageHeader, Select, Table, confirmDialog, promptDialog } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminMutation } from "@/lib/adminHooks";
import { usePaged } from "@/lib/usePaged";
import { formatDateTime, taka } from "@/lib/format";

const COLOR = { success: "green", pending_review: "amber", initiated: "slate", failed: "red", cancelled: "slate", refunded: "blue" };

export default function AdminPaymentsPage() {
  const [q, setQ] = useState({ status: "pending_review", scope: "", page: 1 });
  const list = usePaged("payments", "/admin/payments", { ...q, page: undefined }, { client: "admin" });
  const { data, isLoading, error } = list;
  const refund = useAdminMutation(({ id, reason }) => adminApi.post(`/admin/payments/${id}/refund`, { reason }), { invalidate: ["payments", "metrics"] });
  const review = useAdminMutation(({ id, approve, reason }) => adminApi.post(`/admin/payments/${id}/review`, { approve, reason }), {
    invalidate: ["payments"],
  });
  const set = (k) => (e) => setQ((s) => ({ ...s, [k]: e.target.value, page: 1 }));

  return (
    <div>
      <PageHeader title="Platform payments" subtitle="Subscriptions and SMS credit purchases from ISPs" />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select
          placeholder="All statuses"
          options={["pending_review", "success", "refunded", "failed", "cancelled", "initiated"].map((s) => ({ value: s, label: s.replace("_", " ") }))}
          value={q.status}
          onChange={set("status")}
        />
        <Select
          placeholder="All types"
          options={[
            { value: "subscription", label: "Subscription" },
            { value: "sms_credit", label: "SMS credits" },
          ]}
          value={q.scope}
          onChange={set("scope")}
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
            columns={[
              { key: "createdAt", header: "Time", render: (a) => formatDateTime(a.createdAt) },
              { key: "company", header: "ISP", render: (a) => a.company?.name ?? "—" },
              { key: "description", header: "For" },
              { key: "amount", header: "Amount", render: (a) => (a.currency === "USD" ? `$${a.amount}` : taka(a.amount)) },
              { key: "gateway", header: "Method" },
              { key: "trx", header: "TrxID / sender", render: (a) => [a.gatewayTrxId, a.manual?.senderNumber].filter(Boolean).join(" · ") || "—" },
              { key: "status", header: "Status", render: (a) => <Badge color={COLOR[a.status]}>{a.status.replace("_", " ")}</Badge> },
              {
                key: "actions",
                header: "",
                render: (a) =>
                  a.status === "success" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => promptDialog("Return the money from the gateway/bKash yourself. This records the refund and removes SMS credits / voids the invoice.", { title: `Refund ${a.description}?`, placeholder: "Reason", minLength: 3, confirmText: "Refund" }).then((reason) => reason && refund.mutate({ id: a._id, reason }))}
                    >
                      Refund
                    </Button>
                  ) : a.status === "pending_review" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="success" onClick={() => confirmDialog(`Approve ${a.description}?`).then((ok) => ok && review.mutate({ id: a._id, approve: true }))}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => promptDialog("The ISP sees this reason.", { title: "Reject this payment?", defaultValue: "Transaction not found", confirmText: "Reject" }).then((reason) => reason !== null && review.mutate({ id: a._id, approve: false, reason }))}
                      >
                        Reject
                      </Button>
                    </div>
                  ),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
