"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import PermissionGate from "@/components/common/PermissionGate";
import { Button, ErrorBox, Loading, PageHeader, Select, StatusBadge, Table, Tip, confirmDialog } from "@/components/ui";
import QuickForm from "@/components/common/QuickForm";
import { api, downloadFile, getErrorMessage } from "@/lib/api";
import { daysUntil, formatDate, taka } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";
import { usePaged } from "@/lib/usePaged";

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

  const list = usePaged("customers", "/customers", { ...query, page: undefined });
  const { data, isLoading, error } = list;
  const zones = useApi("zones", "/zones");
  const packages = useApi("packages", "/packages");
  const [bulk, setBulk] = useState(false);
  const bulkRun = useApiMutation((b) => api.post("/customers/bulk", b), { invalidate: ["customers"] });

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
            <PermissionGate perm="customer.enable_disable">
              <Button variant="secondary" onClick={() => setBulk(true)}>
                Bulk action
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
      {bulk && (
        <QuickForm
          title="Bulk action (whole zone)"
          submitLabel="Run"
          loading={bulkRun.isPending}
          initial={{ action: "disable" }}
          fields={[
            { name: "zone", label: "Zone", type: "select", required: true, placeholder: "— choose —", options: (zones.data?.data ?? []).map((z) => ({ value: z._id, label: z.name })) },
            { name: "action", label: "Action", type: "select", options: [{ value: "disable", label: "Disable all" }, { value: "enable", label: "Enable all (manually disabled ones)" }, { value: "package", label: "Move all to a package" }] },
            { name: "package", label: "Package (for “Move”)", type: "select", placeholder: "—", options: (packages.data?.data ?? []).map((p) => ({ value: p._id, label: p.name })) },
          ]}
          onSubmit={async (v) => {
            if (!(await confirmDialog("Apply to every customer in this zone (max 500)?", { danger: true }))) throw new Error("cancelled");
            return bulkRun.mutateAsync({ zone: v.zone, action: v.action, package: v.action === "package" ? v.package : undefined });
          }}
          onClose={() => setBulk(false)}
        />
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, ID, username..."
          className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-100 md:col-span-2"
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
          <Table pager={list.pager}
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
                    <p className="text-xs text-zinc-500">{c.phone}</p>
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
                    <span className={d < 0 ? "text-rose-600" : d <= 3 ? "text-amber-600" : ""}>
                      {formatDate(c.expiryDate)}
                    </span>
                  );
                },
              },
              { key: "dueAmount", header: "Due", render: (c) => (c.dueAmount ? <span className="text-rose-600">{taka(c.dueAmount)}</span> : "—") },
              {
                key: "status",
                header: "Status",
                render: (c) => (
                  <div className="flex items-center gap-1">
                    <StatusBadge status={c.status} />
                    {c.syncStatus !== "synced" && (
                      <Tip content={c.syncError ?? "Not synced with the router yet"}>
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                          <AlertTriangle className="size-3" /> {c.syncStatus === "failed" ? "router" : "syncing"}
                        </span>
                      </Tip>
                    )}
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

export default function CustomersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CustomersList />
    </Suspense>
  );
}
