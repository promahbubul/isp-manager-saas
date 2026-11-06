"use client";

import { useState } from "react";
import { Badge, Button, ErrorBox, Loading, PageHeader, Pagination, Select, Table } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminApi, useAdminMutation } from "@/lib/adminHooks";
import { formatDateTime, taka } from "@/lib/format";

const COLOR = { success: "green", pending_review: "amber", initiated: "slate", failed: "red", cancelled: "slate" };

export default function AdminPaymentsPage() {
  const [q, setQ] = useState({ status: "pending_review", scope: "", page: 1 });
  const params = Object.fromEntries(Object.entries({ ...q, limit: 25 }).filter(([, v]) => v !== ""));
  const { data, isLoading, error } = useAdminApi(["payments", params], "/admin/payments", params);
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
          options={["pending_review", "success", "failed", "cancelled", "initiated"].map((s) => ({ value: s, label: s.replace("_", " ") }))}
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
          <Table
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
                  a.status === "pending_review" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="success" onClick={() => confirm(`Approve ${a.description}?`) && review.mutate({ id: a._id, approve: true })}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          const reason = prompt("Reason?", "Transaction not found");
                          if (reason !== null) review.mutate({ id: a._id, approve: false, reason });
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  ),
              },
            ]}
          />
          <Pagination meta={data?.meta} onPage={(page) => setQ((s) => ({ ...s, page }))} />
        </>
      )}
    </div>
  );
}
