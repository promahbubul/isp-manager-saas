"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import QuickForm from "@/components/common/QuickForm";
import { Badge, Button, ErrorBox, Loading, PageHeader, Pagination, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { taka } from "@/lib/format";
import { useApiMutation } from "@/lib/hooks";
import { usePaged } from "@/lib/usePaged";

export default function ResellersPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const list = usePaged("resellers", "/resellers");
  const { data, isLoading, error } = list;
  const create = useApiMutation((body) => api.post("/resellers", body), { invalidate: ["resellers"] });

  return (
    <div>
      <PageHeader
        title="Resellers"
        subtitle="Sub-dealers who sell your connections. They buy balance from you; every recharge they do uses it."
        actions={
          <PermissionGate perm="reseller.manage">
            <Button onClick={() => setCreating(true)}>+ Add reseller</Button>
          </PermissionGate>
        }
      />
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={data?.data ?? []}
            empty="No resellers yet."
            onRowClick={(r) => router.push(`/dashboard/resellers/${r._id}`)}
            columns={[
              { key: "name", header: "Name", render: (r) => <strong>{r.name}</strong> },
              { key: "phone", header: "Mobile (login)" },
              { key: "balance", header: "Balance", render: (r) => <span className={r.balance < 0 ? "text-rose-600" : ""}>{taka(r.balance)}</span> },
              { key: "discountPercent", header: "Rate", render: (r) => `price − ${r.discountPercent}%` },
              { key: "customers", header: "Customers", render: (r) => `${r.customers.active} active / ${r.customers.total}` },
              { key: "isActive", header: "Status", render: (r) => <Badge color={r.isActive ? "green" : "slate"}>{r.isActive ? "active" : "inactive"}</Badge> },
            ]}
          />
          <Pagination {...list.pager} />
        </>
      )}
      {creating && (
        <QuickForm
          title="Add reseller"
          submitLabel="Create"
          loading={create.isPending}
          fields={[
            { name: "name", label: "Name / shop", required: true },
            { name: "phone", label: "Mobile (used to log in)", required: true },
            { name: "password", label: "Login password", type: "password", required: true, hint: "At least 8 characters with a letter and a number" },
            { name: "discountPercent", label: "Discount on package price (%)", type: "number", hint: "Reseller pays package price minus this. Per-package rates can be set later." },
            { name: "creditLimit", label: "Credit limit (৳)", type: "number", hint: "How far below zero their balance may go" },
            { name: "address", label: "Address" },
          ]}
          onSubmit={(v) => create.mutateAsync(v)}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
