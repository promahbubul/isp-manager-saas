"use client";

import Link from "next/link";
import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import QuickForm from "@/components/common/QuickForm";
import { Badge, Button, ErrorBox, Loading, Modal, PageHeader, Table, confirmDialog } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";

const LEVEL_COLOR = { good: "green", ok: "blue", weak: "amber", bad: "red", offline: "slate" };

/** Fiber OLTs: read every ONU's optical signal (RX dBm) over SNMP and match it to customers. */
export default function OltsPage() {
  const [editing, setEditing] = useState(null);
  const [readings, setReadings] = useState(null); // { olt, rows }
  const [filter, setFilter] = useState("all");
  const { data, isLoading, error } = useApi("olts", "/olts");
  const profiles = useApi("olt-profiles", "/olts/profiles");
  const save = useApiMutation((b) => (editing?._id ? api.patch(`/olts/${editing._id}`, b) : api.post("/olts", b)), { invalidate: ["olts"] });
  const remove = useApiMutation((id) => api.delete(`/olts/${id}`), { invalidate: ["olts"] });
  const poll = useApiMutation((o) => api.post(`/olts/${o._id}/poll`), { invalidate: ["olts"], onSuccess: (r, o) => setReadings({ olt: o, rows: r.data }) });

  const vendorOptions = [
    ...Object.entries(profiles.data?.data ?? {}).map(([value, p]) => ({ value, label: p.label })),
    { value: "custom", label: "Other brand (enter OIDs) — VSOL, C-Data, ZTE..." },
  ];
  const rows = (readings?.rows ?? []).filter((r) => filter === "all" || (filter === "weak" ? r.level === "weak" || r.level === "bad" : filter === "unmatched" ? !r.customer : r.level === filter));

  return (
    <div>
      <PageHeader
        title="OLTs (fiber)"
        subtitle="Reads each ONU's signal from the OLT every 30 minutes over SNMP (read-only). Put the ONU MAC / serial on the customer to match."
        actions={
          <PermissionGate perm="router.manage">
            <Button onClick={() => setEditing({})}>+ Add OLT</Button>
          </PermissionGate>
        }
      />
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <Table
          rows={data?.data ?? []}
          empty="No OLT yet. Add one to see ONU signal levels."
          columns={[
            { key: "name", header: "Name", render: (o) => <strong>{o.name}</strong> },
            { key: "host", header: "IP", render: (o) => `${o.host}:${o.port}` },
            { key: "vendor", header: "Type", render: (o) => o.vendor.replace("_", " ") },
            { key: "onuCount", header: "ONUs", render: (o) => o.onuCount ?? "—" },
            { key: "weakCount", header: "Weak", render: (o) => (o.weakCount ? <Badge color="amber">{o.weakCount}</Badge> : "—") },
            { key: "lastPollAt", header: "Last read", render: (o) => <span title={o.lastError}>{formatDateTime(o.lastPollAt)}{o.lastError && <span className="ml-1 text-rose-600">⚠</span>}</span> },
            {
              key: "x",
              header: "",
              render: (o) => (
                <div className="flex justify-end gap-2">
                  <Button size="sm" loading={poll.isPending && poll.variables?._id === o._id} onClick={() => poll.mutate(o)}>
                    Read now
                  </Button>
                  <PermissionGate perm="router.manage">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(o)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => confirmDialog(`Remove ${o.name}?`).then((ok) => ok && remove.mutate(o._id))}>
                      Delete
                    </Button>
                  </PermissionGate>
                </div>
              ),
            },
          ]}
        />
      )}

      {editing && (
        <QuickForm
          title={editing._id ? `Edit ${editing.name}` : "Add OLT"}
          loading={save.isPending}
          initial={editing._id ? { ...editing, community: "", ...Object.fromEntries(Object.entries(editing.oids ?? {}).map(([k, v]) => [`oid_${k}`, v])) } : { vendor: "huawei_gpon", port: 161 }}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "vendor", label: "Brand / type", type: "select", options: vendorOptions },
            { name: "host", label: "OLT IP (reachable from the server, e.g. over the VPN)", required: true },
            { name: "port", label: "SNMP port", type: "number" },
            { name: "community", label: editing._id ? "SNMP read community (empty = keep)" : "SNMP read community", type: "password", required: !editing._id },
            { name: "oid_id", label: "Custom: ONU MAC/serial table OID" },
            { name: "oid_name", label: "Custom: ONU name table OID (optional)" },
            { name: "oid_rx", label: "Custom: ONU RX power table OID" },
            { name: "oid_rxDivisor", label: "Custom: divide raw RX by (100 = 0.01 dBm)", type: "number" },
            { name: "oid_rxOffset", label: "Custom: then add (dBm)", type: "number" },
          ]}
          onSubmit={(v) => {
            const oids = Object.fromEntries(
              ["id", "name", "rx", "rxDivisor", "rxOffset"].filter((k) => v[`oid_${k}`] !== undefined && v[`oid_${k}`] !== "").map((k) => [k, v[`oid_${k}`]]),
            );
            const body = { name: v.name, vendor: v.vendor, host: v.host, port: v.port, ...(v.community ? { community: v.community } : {}), ...(Object.keys(oids).length ? { oids } : {}) };
            return save.mutateAsync(body);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      <Modal open={Boolean(readings)} onClose={() => setReadings(null)} title={`ONUs on ${readings?.olt.name ?? ""}`} size="lg">
        <div className="mb-3 flex flex-wrap gap-2">
          {["all", "weak", "offline", "unmatched"].map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "primary" : "secondary"} onClick={() => setFilter(f)}>
              {f === "unmatched" ? "no customer" : f}
            </Button>
          ))}
        </div>
        <div className="max-h-[28rem] overflow-auto">
          <Table
            rowKey="index"
            rows={rows}
            empty="Nothing in this filter."
            columns={[
              { key: "onuId", header: "ONU MAC / serial", render: (r) => <code className="text-xs">{r.onuId}</code> },
              { key: "name", header: "Name on OLT" },
              { key: "rx", header: "Signal", render: (r) => <Badge color={LEVEL_COLOR[r.level]}>{r.rx === null ? "offline" : `${r.rx} dBm`}</Badge> },
              { key: "customer", header: "Customer", render: (r) => (r.customer ? <Link className="text-primary-700 hover:underline" href={`/dashboard/customers/${r.customer._id}`}>{`${r.customer.name} (${r.customer.customerId})`}</Link> : "—") },
            ]}
          />
        </div>
        <p className="mt-3 text-xs text-zinc-500">Good ≥ −24 dBm · OK to −27 · weak to −30 · below that the fiber or connector usually needs cleaning or repair.</p>
      </Modal>
    </div>
  );
}
