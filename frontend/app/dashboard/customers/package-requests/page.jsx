"use client";

import Link from "next/link";
import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import { Badge, Button, ErrorBox, Loading, PageHeader, Select, Table, confirmDialog } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime, taka } from "@/lib/format";
import { useApiMutation } from "@/lib/hooks";
import { usePaged } from "@/lib/usePaged";

const COLOR = { pending: "amber", approved: "green", rejected: "red", cancelled: "slate" };

/** Package change requests customers send from the self-care portal. */
export default function PackageRequestsPage() {
  const [q, setQ] = useState({ status: "pending", page: 1 });
  const list = usePaged("package-requests", "/package-requests", { ...q, page: undefined });
  const { data, isLoading, error } = list;
  const decide = useApiMutation(({ id, approve }) => api.post(`/package-requests/${id}/decide`, { approve }), { invalidate: ["package-requests", "customers"] });

  return (
    <div>
      <PageHeader title="Package change requests" subtitle="Approving changes the customer's package and monthly fee and updates the router." />
      <div className="mb-4 w-48">
        <Select value={q.status} onChange={(e) => setQ({ status: e.target.value, page: 1 })} options={["pending", "approved", "rejected"].map((s) => ({ value: s, label: s }))} />
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table pager={list.pager}
            rows={data?.data ?? []}
            empty="No requests."
            columns={[
              { key: "createdAt", header: "Requested", render: (r) => formatDateTime(r.createdAt) },
              { key: "customer", header: "Customer", render: (r) => (r.customer ? <Link className="font-medium text-primary-600 hover:underline dark:text-primary-400" href={`/dashboard/customers/${r.customer._id}`}>{r.customer.name} ({r.customer.customerId})</Link> : "—") },
              { key: "phone", header: "Mobile", render: (r) => r.customer?.phone },
              { key: "from", header: "From", render: (r) => `${r.fromPackage?.name} · ${taka(r.fromPackage?.price)}` },
              { key: "to", header: "To", render: (r) => <strong>{`${r.toPackage?.name} · ${taka(r.toPackage?.price)}`}</strong> },
              { key: "note", header: "Note", className: "max-w-xs truncate" },
              { key: "status", header: "Status", render: (r) => <Badge color={COLOR[r.status]}>{r.status}</Badge> },
              {
                key: "act",
                header: "",
                render: (r) =>
                  r.status === "pending" && (
                    <PermissionGate perm="customer.edit">
                      <div className="flex gap-1">
                        <Button size="sm" variant="success" loading={decide.isPending} onClick={() => decide.mutate({ id: r._id, approve: true })}>
                          Approve
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => confirmDialog(`Reject ${r.customer?.name ?? "this"}'s request to move to ${r.toPackage?.name}?`).then((ok) => ok && decide.mutate({ id: r._id, approve: false }))}>
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
