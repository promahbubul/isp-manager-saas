"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import PermissionGate from "@/components/common/PermissionGate";
import { Badge, Button, ErrorBox, Input, Loading, PageHeader, Pagination, Table } from "@/components/ui";
import { downloadFile, getErrorMessage } from "@/lib/api";
import { formatDateTime, toDateInput } from "@/lib/format";
import { useApi } from "@/lib/hooks";

/** BTRC user log: who had which IP when. Recorded from the routers every 5 minutes. */
export default function IpLogPage() {
  const [q, setQ] = useState({ from: toDateInput(new Date(Date.now() - 86_400_000)), to: toDateInput(new Date()), q: "", page: 1 });
  const params = Object.fromEntries(Object.entries({ ...q, limit: 50 }).filter(([, v]) => v !== ""));
  const { data, isLoading, error } = useApi(["ip-log", params], "/ip-logs", params);
  const set = (k) => (e) => setQ((s) => ({ ...s, [k]: e.target.value, page: 1 }));
  const [busy, setBusy] = useState(false);

  const exportXlsx = async () => {
    setBusy(true);
    try {
      await downloadFile("/ip-logs/export", { from: q.from, to: q.to, q: q.q || undefined }, "ip-log.xlsx");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="IP log (BTRC)"
        subtitle="Every PPPoE session with IP and MAC, recorded every 5 minutes. Keep exports for BTRC/law-enforcement requests."
        actions={
          <PermissionGate perm="ip_log.export">
            <Button variant="secondary" loading={busy} onClick={exportXlsx}>
              Export Excel
            </Button>
          </PermissionGate>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Input label="From" type="date" value={q.from} onChange={set("from")} />
        <Input label="To" type="date" value={q.to} onChange={set("to")} />
        <Input label="Search" placeholder="IP, MAC or username" value={q.q} onChange={set("q")} className="sm:col-span-2" />
      </div>
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={data?.data ?? []}
            empty="No sessions in this period."
            columns={[
              { key: "username", header: "Username", render: (s) => <strong>{s.username}</strong> },
              { key: "customer", header: "Customer", render: (s) => (s.customer ? `${s.customer.name} (${s.customer.customerId})` : "—") },
              { key: "ip", header: "IP" },
              { key: "mac", header: "MAC" },
              { key: "router", header: "Router", render: (s) => s.router?.name },
              { key: "startedAt", header: "Login", render: (s) => formatDateTime(s.startedAt) },
              { key: "endedAt", header: "Logout", render: (s) => (s.endedAt ? formatDateTime(s.endedAt) : <Badge color="green">online</Badge>) },
            ]}
          />
          <Pagination meta={data?.meta} onPage={(page) => setQ((s) => ({ ...s, page }))} />
        </>
      )}
    </div>
  );
}
