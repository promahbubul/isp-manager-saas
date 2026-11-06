"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import toast from "react-hot-toast";
import PermissionGate from "@/components/common/PermissionGate";
import { Button, ErrorBox, Loading, PageHeader, Pagination, Select, StatusBadge, Table } from "@/components/ui";
import { downloadFile, getErrorMessage } from "@/lib/api";
import { daysUntil, formatDate, taka } from "@/lib/format";
import { useApi } from "@/lib/hooks";

const STATUS_OPTIONS = ["active", "expired", "disabled", "free"].map((s) => ({ value: s, label: s }));

function CustomersList() {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");

  const query = Object.fromEntries(
    ["search", "status", "zone", "package", "syncStatus", "expiring", "page"]
      .map((k) => [k, params.get(k)])
      .filter(([, v]) => v),
  );

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.replace(`/dashboard/customers?${next}`);
  };

  // Debounced search box → URL
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("search") ?? "") !== search) setParam("search", search);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, isLoading, error } = useApi(["customers", query], "/customers", { limit: 25, ...query });
  const zones = useApi("zones", "/zones");
  const packages = useApi("packages", "/packages");

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={query.expiring ? `Expiring within ${query.expiring} day(s)` : undefined}
        actions={
          <>
            <PermissionGate perm="customer.export">
              <Button
                variant="secondary"
                onClick={() => downloadFile("/customers/export", query, "customers.xlsx").catch((e) => toast.error(getErrorMessage(e)))}
              >
                Export Excel
              </Button>
            </PermissionGate>
            <PermissionGate perm="customer.create">
              <Link href="/dashboard/customers/create">
                <Button>+ Add customer</Button>
              </Link>
            </PermissionGate>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, ID, username..."
          className="rounded-md border border-slate-300 px-3 py-2 md:col-span-2"
        />
        <Select placeholder="All statuses" options={STATUS_OPTIONS} value={query.status ?? ""} onChange={(e) => setParam("status", e.target.value)} />
        <Select
          placeholder="All zones"
          options={(zones.data?.data ?? []).map((z) => ({ value: z._id, label: z.name }))}
          value={query.zone ?? ""}
          onChange={(e) => setParam("zone", e.target.value)}
        />
        <Select
          placeholder="All packages"
          options={(packages.data?.data ?? []).map((p) => ({ value: p._id, label: p.name }))}
          value={query.package ?? ""}
          onChange={(e) => setParam("package", e.target.value)}
        />
      </div>

      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={data?.data ?? []}
            onRowClick={(c) => router.push(`/dashboard/customers/${c._id}`)}
            columns={[
              { key: "customerId", header: "ID" },
              {
                key: "name",
                header: "Name",
                render: (c) => (
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.phone}</p>
                  </div>
                ),
              },
              { key: "username", header: "Username", render: (c) => c.pppoe?.username },
              { key: "package", header: "Package", render: (c) => c.package?.name ?? "—" },
              { key: "zone", header: "Zone", render: (c) => c.zone?.name ?? "—" },
              {
                key: "expiryDate",
                header: "Expiry",
                render: (c) => {
                  if (c.status === "free") return "—";
                  const d = daysUntil(c.expiryDate);
                  return (
                    <span className={d < 0 ? "text-red-600" : d <= 3 ? "text-amber-600" : ""}>
                      {formatDate(c.expiryDate)}
                    </span>
                  );
                },
              },
              { key: "dueAmount", header: "Due", render: (c) => (c.dueAmount ? <span className="text-red-600">{taka(c.dueAmount)}</span> : "—") },
              {
                key: "status",
                header: "Status",
                render: (c) => (
                  <div className="flex items-center gap-1">
                    <StatusBadge status={c.status} />
                    {c.syncStatus !== "synced" && <span title={c.syncError ?? "Not synced with router"}>⚠️</span>}
                  </div>
                ),
              },
            ]}
          />
          <Pagination meta={data?.meta} onPage={(p) => setParam("page", String(p))} />
        </>
      )}
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CustomersList />
    </Suspense>
  );
}
