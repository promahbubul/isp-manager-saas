"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import { Badge, Button, Card, ErrorBox, InfoList, Loading, Modal, PageHeader, StatusBadge, Table, Tip, confirmDialog } from "@/components/ui";
import { api } from "@/lib/api";
import { daysUntil, formatDate, formatDateTime, taka } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";
import { CustomerActions, CustomerDocuments, CustomerTimeline } from "@/components/customer/CustomerExtras";
import { useAuth } from "@/providers/AuthProvider";

function LiveStatus({ id }) {
  const live = useApi(["customer-live", id], `/customers/${id}/live`, undefined, { retry: false, refetchInterval: 30_000 });
  if (live.isLoading) return <p className="text-sm text-zinc-500">Checking router...</p>;
  if (live.error) return <ErrorBox error={live.error} />;
  const d = live.data.data;
  const mismatch = d.secret.exists && d.secret.disabled === d.expectedEnabled;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${d.online ? "bg-emerald-500" : "bg-zinc-300"}`} />
        <span className="font-semibold">{d.online ? "Online" : "Offline"}</span>
      </div>
      {d.session && (
        <InfoList
          items={[
            { label: "IP address", value: d.session.address },
            { label: "MAC", value: d.session.callerId },
            { label: "Uptime", value: d.session.uptime },
          ]}
        />
      )}
      <p className="text-sm text-zinc-600">
        Router secret:{" "}
        {d.secret.exists ? (
          <>
            {d.secret.disabled ? <Badge color="red">disabled</Badge> : <Badge color="green">enabled</Badge>} · profile {d.secret.profile}
          </>
        ) : (
          <Badge color="red">missing</Badge>
        )}
      </p>
      {(mismatch || !d.secret.exists) && <ErrorBox>The router does not match the billing status. Use “Sync to router”.</ErrorBox>}
    </div>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { can } = useAuth();
  const [creds, setCreds] = useState(null);
  const { data, isLoading, error } = useApi(["customer", id], `/customers/${id}`);
  const payments = useApi(["payments", { customer: id }], "/payments", { customer: id, limit: 10 }, { enabled: can("payment.view") });

  const invalidate = [["customer", id], ["customer-live", id], "customers"];
  const enable = useApiMutation(() => api.patch(`/customers/${id}/enable`), { invalidate });
  const disable = useApiMutation(() => api.patch(`/customers/${id}/disable`), { invalidate });
  const kick = useApiMutation(() => api.post(`/customers/${id}/kick`), { invalidate });
  const sync = useApiMutation(() => api.post(`/customers/${id}/sync`), { invalidate });
  const remove = useApiMutation(() => api.delete(`/customers/${id}`), {
    invalidate: ["customers"],
    onSuccess: () => router.replace("/dashboard/customers"),
  });
  const showCreds = useApiMutation(() => api.get(`/customers/${id}/credentials`), {
    successToast: false,
    onSuccess: (res) => setCreds(res.data),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const c = data.data;
  const days = daysUntil(c.expiryDate);

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.name}
        subtitle={`${c.customerId} · ${c.pppoe.username}`}
        actions={
          <>
            <PermissionGate perm="payment.recharge">
              {c.status !== "free" && (
                <Link href={`/dashboard/billing/recharge?customer=${id}`}>
                  <Button variant="success">Recharge</Button>
                </Link>
              )}
            </PermissionGate>
            <CustomerActions customer={c} />
            <PermissionGate perm="customer.edit">
              <Link href={`/dashboard/customers/${id}/edit`}>
                <Button variant="secondary">Edit</Button>
              </Link>
            </PermissionGate>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-surface p-4">
          <p className="text-sm text-zinc-500">Status</p>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={c.status} />
            {c.syncStatus !== "synced" && <Badge color="amber">sync {c.syncStatus}</Badge>}
          </div>
          {c.syncError && <p className="mt-1 text-xs text-rose-600">{c.syncError}</p>}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-surface p-4">
          <p className="text-sm text-zinc-500">Expiry</p>
          <p className={`mt-1 text-lg font-bold ${days < 0 ? "text-rose-600" : days <= 3 ? "text-amber-600" : ""}`}>
            {c.status === "free" ? "Never" : formatDate(c.expiryDate)}
          </p>
          {c.status !== "free" && <p className="text-xs text-zinc-500">{days < 0 ? `${-days} day(s) ago` : `${days} day(s) left`}</p>}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-surface p-4">
          <p className="text-sm text-zinc-500">Due</p>
          <p className={`mt-1 text-lg font-bold ${c.dueAmount ? "text-rose-600" : ""}`}>{taka(c.dueAmount)}</p>
          {c.balance > 0 && <p className="text-xs text-emerald-700">Advance {taka(c.balance)}</p>}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-surface p-4">
          <p className="text-sm text-zinc-500">Monthly bill</p>
          <p className="mt-1 text-lg font-bold">{taka(c.monthlyFee - c.discount)}</p>
          {c.discount > 0 && <p className="text-xs text-zinc-500">after {taka(c.discount)} discount</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <InfoList
            items={[
              { label: "Mobile", value: c.phone },
              { label: "Alt. mobile", value: c.altPhone },
              { label: "Email", value: c.email },
              { label: "NID", value: c.nid },
              { label: "Zone", value: c.zone?.name },
              { label: "Address", value: c.address },
              { label: "Package", value: c.package ? `${c.package.name} (${c.package.speedDown}/${c.package.speedUp} Mbps)` : "—" },
              { label: "Router", value: c.router?.name },
              { label: "Connection date", value: formatDate(c.connectionDate) },
              { label: "Auto disable", value: c.autoDisable ? "Yes" : "No" },
              { label: "ONU MAC / serial", value: c.device?.onuMac },
              {
                label: "ONU signal",
                value:
                  c.device?.onuRxAt &&
                  (c.device.onuRx == null ? (
                    <Badge color="slate">offline</Badge>
                  ) : (
                    <Tip content={`Read ${formatDateTime(c.device.onuRxAt)}`}>
                      <span>
                        <Badge color={c.device.onuRx >= -24 ? "green" : c.device.onuRx >= -27 ? "blue" : c.device.onuRx >= -30 ? "amber" : "red"}>{`${c.device.onuRx} dBm`}</Badge>
                      </span>
                    </Tip>
                  )),
              },
              { label: "Fiber length", value: c.device?.fiberLength ? `${c.device.fiberLength} m` : undefined },
              { label: "Box / Port", value: [c.device?.boxNo, c.device?.port].filter(Boolean).join(" / ") || undefined },
              { label: "Note", value: c.note },
            ]}
          />
        </Card>

        <Card title="Router">
          <LiveStatus id={id} />
          <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-200 pt-4">
            <PermissionGate perm="customer.enable_disable">
              {c.status === "disabled" ? (
                <Button size="sm" variant="success" loading={enable.isPending} onClick={() => enable.mutate()}>
                  Enable
                </Button>
              ) : (
                <Button size="sm" variant="danger" loading={disable.isPending} onClick={() => confirmDialog("Disable this connection?").then((ok) => ok && disable.mutate())}>
                  Disable
                </Button>
              )}
            </PermissionGate>
            <PermissionGate perm="customer.kick">
              <Button size="sm" variant="secondary" loading={kick.isPending} onClick={() => kick.mutate()}>
                Disconnect
              </Button>
            </PermissionGate>
            <PermissionGate perm="customer.edit">
              <Button size="sm" variant="secondary" loading={sync.isPending} onClick={() => sync.mutate()}>
                Sync to router
              </Button>
              <Button size="sm" variant="secondary" onClick={() => showCreds.mutate()}>
                Show password
              </Button>
            </PermissionGate>
          </div>
        </Card>
      </div>

      <PermissionGate perm="payment.view">
        <Card title="Recent payments">
          <Table
            rows={payments.data?.data ?? []}
            empty="No payments yet."
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
              { key: "amount", header: "Paid", render: (p) => taka(p.amount) },
              { key: "months", header: "Months" },
              { key: "method", header: "Method" },
              { key: "newExpiry", header: "New expiry", render: (p) => formatDate(p.newExpiry) },
              { key: "receivedBy", header: "By", render: (p) => p.receivedBy?.name },
            ]}
          />
        </Card>
      </PermissionGate>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CustomerTimeline id={id} />
        <CustomerDocuments customer={c} />
      </div>

      <PermissionGate perm="customer.delete">
        <div className="flex justify-end">
          <Button
            variant="ghost"
            className="text-rose-600"
            onClick={() => confirmDialog(`Mark ${c.name} as left? The PPPoE account will be removed from the router.`).then((ok) => ok && remove.mutate())}
          >
            Customer left — remove
          </Button>
        </div>
      </PermissionGate>

      <Modal open={Boolean(creds)} onClose={() => setCreds(null)} title="PPPoE credentials" size="sm">
        {creds && (
          <div className="rounded-md bg-zinc-100 p-4 font-mono">
            <p>Username: {creds.username}</p>
            <p>Password: {creds.password}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
