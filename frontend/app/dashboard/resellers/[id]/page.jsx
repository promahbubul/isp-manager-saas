"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import QuickForm from "@/components/common/QuickForm";
import { Badge, Button, Card, ErrorBox, InfoList, Loading, PageHeader, Pagination, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime, taka } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";
import { usePaged } from "@/lib/usePaged";

const TX_COLOR = { deposit: "green", recharge: "blue", refund: "amber", adjust: "slate" };

export default function ResellerDetailPage() {
  const { id } = useParams();
  const [modal, setModal] = useState(null); // deposit | adjust | edit
  const { data, isLoading, error } = useApi(["reseller", id], `/resellers/${id}`);
  const ledger = usePaged(["reseller-ledger", id], `/resellers/${id}/ledger`);
  const inv = [["reseller", id], ["reseller-ledger", id], "resellers"];
  const deposit = useApiMutation((b) => api.post(`/resellers/${id}/deposit`, b), { invalidate: [...inv, "pnl", "ledger"] });
  const adjust = useApiMutation((b) => api.post(`/resellers/${id}/adjust`, b), { invalidate: inv });
  const update = useApiMutation((b) => api.patch(`/resellers/${id}`, b), { invalidate: inv });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const r = data.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={r.name}
        subtitle={`Login: ${r.phone}`}
        actions={
          <>
            <PermissionGate perm="reseller.deposit">
              <Button onClick={() => setModal("deposit")}>+ Add balance</Button>
            </PermissionGate>
            <PermissionGate perm="reseller.manage">
              <Button variant="secondary" onClick={() => setModal("adjust")}>
                Correct balance
              </Button>
              <Button variant="secondary" onClick={() => setModal("edit")}>
                Edit
              </Button>
              <Button variant={r.isActive ? "danger" : "success"} onClick={() => update.mutate({ isActive: !r.isActive })}>
                {r.isActive ? "Deactivate" : "Activate"}
              </Button>
            </PermissionGate>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Account">
          <InfoList
            items={[
              { label: "Balance", value: <strong className={r.balance < 0 ? "text-rose-600" : ""}>{taka(r.balance)}</strong> },
              { label: "Credit limit", value: taka(r.creditLimit) },
              { label: "Default rate", value: `package price − ${r.discountPercent}%` },
              { label: "Status", value: <Badge color={r.isActive ? "green" : "slate"}>{r.isActive ? "active" : "inactive"}</Badge> },
              { label: "Last login", value: formatDateTime(r.user?.lastLogin) },
              { label: "Address", value: r.address },
            ]}
          />
        </Card>
        <Card title="Package rates">
          {r.rates.length === 0 ? (
            <p className="text-sm text-zinc-500">All packages use the default rate.</p>
          ) : (
            <Table rowKey="package" rows={r.rates.map((x) => ({ ...x, package: x.package?._id, name: x.package?.name, list: x.package?.price }))} columns={[{ key: "name", header: "Package" }, { key: "list", header: "List price", render: (x) => taka(x.list) }, { key: "price", header: "Reseller pays", render: (x) => taka(x.price) }]} />
          )}
        </Card>
      </div>
      <Card title="Balance history">
        {ledger.isLoading ? (
          <Loading />
        ) : (
          <>
            <Table
              rows={ledger.data?.data ?? []}
              empty="No transactions."
              columns={[
                { key: "createdAt", header: "Time", render: (t) => formatDateTime(t.createdAt) },
                { key: "type", header: "Type", render: (t) => <Badge color={TX_COLOR[t.type]}>{t.type}</Badge> },
                { key: "amount", header: "Amount", render: (t) => <span className={t.amount < 0 ? "text-rose-600" : "text-emerald-700"}>{taka(t.amount)}</span> },
                { key: "balanceAfter", header: "Balance after", render: (t) => taka(t.balanceAfter) },
                { key: "customer", header: "Customer", render: (t) => (t.customer ? `${t.customer.name} (${t.customer.customerId})` : "—") },
                { key: "note", header: "Note", className: "max-w-xs truncate" },
                { key: "by", header: "By", render: (t) => t.by?.name },
              ]}
            />
            <Pagination {...ledger.pager} />
          </>
        )}
      </Card>

      {modal === "deposit" && (
        <QuickForm
          title={`Add balance to ${r.name}`}
          submitLabel="Add"
          loading={deposit.isPending}
          initial={{ method: "cash" }}
          fields={[
            { name: "amount", label: "Amount received (৳)", type: "number", required: true },
            { name: "method", label: "Received by", type: "select", options: ["cash", "bank", "bkash", "nagad", "rocket", "other"].map((m) => ({ value: m, label: m })) },
            { name: "note", label: "Note" },
          ]}
          onSubmit={(v) => deposit.mutateAsync(v)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "adjust" && (
        <QuickForm
          title="Correct balance"
          loading={adjust.isPending}
          fields={[
            { name: "amount", label: "Amount (+ add / − remove)", type: "number", required: true, hint: "Not counted as income — use Add balance for money received" },
            { name: "note", label: "Reason", required: true },
          ]}
          onSubmit={(v) => adjust.mutateAsync(v)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "edit" && (
        <QuickForm
          title="Edit reseller"
          loading={update.isPending}
          initial={{ name: r.name, discountPercent: r.discountPercent, creditLimit: r.creditLimit, address: r.address ?? "" }}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "discountPercent", label: "Discount on package price (%)", type: "number", required: true },
            { name: "creditLimit", label: "Credit limit (৳)", type: "number", required: true },
            { name: "address", label: "Address" },
            { name: "password", label: "New login password", type: "password", hint: "Leave empty to keep" },
          ]}
          onSubmit={(v) => update.mutateAsync(v)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
