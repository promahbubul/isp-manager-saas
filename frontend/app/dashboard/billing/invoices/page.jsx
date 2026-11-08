"use client";

import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import { Badge, Button, ErrorBox, Loading, PageHeader, Select, Table, confirmDialog } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, taka } from "@/lib/format";
import { useApiMutation } from "@/lib/hooks";
import { usePaged } from "@/lib/usePaged";

const COLOR = { unpaid: "red", partial: "amber", paid: "green", void: "slate" };

/** Postpaid invoices: issued on the 1st, paid via Billing → Recharge (settles the oldest first). */
export default function InvoicesPage() {
  const [q, setQ] = useState({ status: "", page: 1 });
  const list = usePaged("invoices", "/invoices", { ...q, page: undefined });
  const { data, isLoading, error } = list;
  const issue = useApiMutation(() => api.post("/invoices/issue"), { invalidate: ["invoices"] });
  const voidIt = useApiMutation((id) => api.post(`/invoices/${id}/void`, {}), { invalidate: ["invoices"] });

  return (
    <div>
      <PageHeader
        title="Postpaid invoices"
        subtitle="Created automatically on the 1st of each month for postpaid customers. Collect them from Billing → Recharge."
        actions={
          <PermissionGate perm="invoice.manage">
            <Button variant="secondary" loading={issue.isPending} onClick={() => issue.mutate()}>
              Issue this month now
            </Button>
          </PermissionGate>
        }
      />
      <div className="mb-4 w-48">
        <Select value={q.status} onChange={(e) => setQ({ status: e.target.value, page: 1 })} options={[{ value: "", label: "All" }, ...["unpaid", "partial", "paid", "void"].map((s) => ({ value: s, label: s }))]} />
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table pager={list.pager}
            indexOffset={list.indexOffset}
            rows={data?.data ?? []}
            empty="No invoices. Set a customer's billing type to Postpaid to start."
            columns={[
              { key: "invoiceNo", header: "Invoice" },
              { key: "period", header: "Month" },
              { key: "customer", header: "Customer", render: (i) => (i.customer ? `${i.customer.name} (${i.customer.customerId})` : "—") },
              { key: "amount", header: "Amount", render: (i) => taka(i.amount) },
              { key: "paid", header: "Paid", render: (i) => taka(i.paid) },
              { key: "dueDate", header: "Due", render: (i) => formatDate(i.dueDate) },
              { key: "status", header: "Status", render: (i) => <Badge color={COLOR[i.status]}>{i.status}</Badge> },
              {
                key: "x",
                header: "",
                render: (i) =>
                  i.status === "unpaid" && (
                    <PermissionGate perm="invoice.manage">
                      <Button size="sm" variant="danger" onClick={() => confirmDialog(`Void ${i.invoiceNo}? Its amount is removed from the customer's due.`).then((ok) => ok && voidIt.mutate(i._id))}>
                        Void
                      </Button>
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
