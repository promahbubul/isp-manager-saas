"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import PermissionGate from "@/components/common/PermissionGate";
import { Badge, Button, Checkbox, ErrorBox, Input, Loading, Modal, PageHeader, StatusBadge, Table } from "@/components/ui";
import { api, applyFieldErrors } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

function RouterForm({ router, onDone }) {
  const { register, handleSubmit, setError, setValue, formState } = useForm({
    defaultValues: {
      name: router?.name ?? "",
      host: router?.host ?? "",
      port: router?.port ?? 8728,
      useSSL: router?.useSSL ?? false,
      username: router?.username ?? "",
      password: "",
    },
  });
  const save = useApiMutation((body) => (router ? api.patch(`/routers/${router._id}`, body) : api.post("/routers", body)), {
    invalidate: ["routers"],
    onSuccess: onDone,
  });
  const e = formState.errors;

  const onSubmit = ({ password, port, ...v }) =>
    save
      .mutateAsync({ ...v, port: Number(port), ...(password ? { password } : {}) })
      .catch((err) => applyFieldErrors(err, setError));

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Input label="Name" required placeholder="Core Router" error={e.name?.message} {...register("name")} className="sm:col-span-2" />
      <Input label="IP / Host" required placeholder="103.x.x.x or 10.100.0.2" error={e.host?.message} {...register("host")} />
      <Input label="API port" type="number" error={e.port?.message} {...register("port")} />
      <Input label="API username" required error={e.username?.message} {...register("username")} />
      <Input
        label="API password"
        type="password"
        required={!router}
        hint={router ? "Leave empty to keep the current password" : undefined}
        error={e.password?.message}
        {...register("password")}
      />
      <div className="sm:col-span-2">
        <Checkbox
          label="Use API-SSL"
          hint="Port 8729 with TLS. Turn on the api-ssl service on the router."
          {...register("useSSL", { onChange: (ev) => setValue("port", ev.target.checked ? 8729 : 8728) })}
        />
      </div>
      <p className="rounded-md bg-zinc-50 p-3 text-xs text-zinc-600 sm:col-span-2">
        On the MikroTik: <code>/ip service enable api</code>, create a dedicated API user with the
        <code> read,write,api,policy,test</code> policies, and allow this server&apos;s IP in the service&apos;s
        &quot;Available From&quot; list.
      </p>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

export default function RoutersPage() {
  const { can } = useAuth();
  const [editing, setEditing] = useState(null);
  const [sessions, setSessions] = useState(null); // { router, rows }
  const { data, isLoading, error } = useApi("routers", "/routers");
  const test = useApiMutation((id) => api.post(`/routers/${id}/test`), { invalidate: ["routers"] });
  const remove = useApiMutation((id) => api.delete(`/routers/${id}`), { invalidate: ["routers"] });
  const [vpnScript, setVpnScript] = useState(null);
  const vpn = useApiMutation(({ id, type }) => api.post(`/routers/${id}/vpn`, { type }), { invalidate: ["routers"], onSuccess: (res) => setVpnScript(res.data.script) });
  const [report, setReport] = useState(null);
  const radius = useApiMutation((id) => api.post(`/routers/${id}/radius`), { invalidate: ["routers"], onSuccess: (res) => setVpnScript(res.data.script) });
  const radiusOff = useApiMutation((id) => api.delete(`/routers/${id}/radius`), { invalidate: ["routers"] });
  const loadReport = useApiMutation((id) => api.get(`/routers/${id}/sync-report`), { successToast: false, onSuccess: (res) => setReport(res.data) });
  const fixAll = useApiMutation((id) => api.post(`/routers/${id}/sync-fix`, {}), { invalidate: ["routers", "customers"], onSuccess: (_r, id) => loadReport.mutate(id) });
  const loadSessions = useApiMutation((r) => api.get(`/routers/${r._id}/active`), {
    successToast: false,
    onSuccess: (res, r) => setSessions({ router: r, rows: res.data }),
  });

  return (
    <div>
      <PageHeader
        title="Routers"
        subtitle="MikroTik routers connected over the RouterOS API"
        actions={
          <PermissionGate perm="router.manage">
            <Button onClick={() => setEditing({})}>+ Add router</Button>
          </PermissionGate>
        }
      />
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : (
        <Table
          rows={data?.data ?? []}
          empty="No routers yet. Add your MikroTik to start syncing customers."
          columns={[
            { key: "name", header: "Name", render: (r) => <strong>{r.name}</strong> },
            { key: "host", header: "Address", render: (r) => `${r.host}:${r.port}${r.useSSL ? " (SSL)" : ""}` },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
            {
              key: "info",
              header: "RouterOS",
              render: (r) => (r.info?.version ? `${r.info.identity} · v${r.info.version}` : "—"),
            },
            {
              key: "lastCheckedAt",
              header: "Last check",
              render: (r) => (
                <span title={r.lastError}>
                  {formatDateTime(r.lastCheckedAt)}
                  {r.lastError && <span className="ml-1 text-rose-600">⚠</span>}
                </span>
              ),
            },
            {
              key: "actions",
              header: "",
              className: "text-right",
              render: (r) => (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" loading={test.isPending && test.variables === r._id} onClick={() => test.mutate(r._id)}>
                    Test
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => loadSessions.mutate(r)}>
                    Online users
                  </Button>
                  <Button size="sm" variant="secondary" loading={loadReport.isPending && loadReport.variables === r._id} onClick={() => loadReport.mutate(r._id)}>
                    Check sync
                  </Button>
                  {can("router.manage") &&
                    (r.authMode === "radius" ? (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => radius.mutate(r._id)}>
                          RADIUS script
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => confirm("Switch back to PPP secrets on the router? Then run Check sync → Fix all.") && radiusOff.mutate(r._id)}>
                          Stop RADIUS
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="secondary" title="Users are checked by our RADIUS server instead of being stored on the router" onClick={() => confirm(`Use RADIUS for "${r.name}"? You get a script for the router. Customers keep working: their logins are then checked by our server.`) && radius.mutate(r._id)}>
                        Use RADIUS
                      </Button>
                    ))}
                  {can("router.manage") && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        title="For routers without a public IP: the router connects to us over WireGuard"
                        loading={vpn.isPending && vpn.variables?.id === r._id}
                        onClick={() => {
                          if (r.connectionMode === "vpn") return vpn.mutate({ id: r._id, type: r.vpn?.type ?? "wireguard" });
                          const ans = prompt(`Switch "${r.name}" to VPN mode?
Type 1 for WireGuard (RouterOS 7, recommended) or 2 for SSTP (RouterOS 6).`, "1");
                          if (ans === "1" || ans === "2") vpn.mutate({ id: r._id, type: ans === "2" ? "sstp" : "wireguard" });
                        }}
                      >
                        {r.connectionMode === "vpn" ? "VPN script" : "Use VPN"}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => confirm(`Delete router "${r.name}"?`) && remove.mutate(r._id)}>
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?._id ? "Edit router" : "Add router"} size="lg">
        {editing !== null && <RouterForm router={editing._id ? editing : null} onDone={() => setEditing(null)} />}
      </Modal>

      <Modal open={Boolean(report)} onClose={() => setReport(null)} title={`DB vs router: ${report?.router.name ?? ""}`} size="lg">
        {report && (
          <div className="space-y-3 text-sm">
            <p className="text-zinc-600">
              {report.customersInDb} PPPoE customers in the software · {report.secretsOnRouter} secrets on the router
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge color={report.summary.missingOnRouter ? "red" : "green"}>{`missing on router: ${report.summary.missingOnRouter}`}</Badge>
              <Badge color={report.summary.shouldBeDisabled ? "red" : "green"}>{`should be off: ${report.summary.shouldBeDisabled}`}</Badge>
              <Badge color={report.summary.shouldBeEnabled ? "amber" : "green"}>{`should be on: ${report.summary.shouldBeEnabled}`}</Badge>
              <Badge color={report.summary.wrongProfile ? "amber" : "green"}>{`wrong profile: ${report.summary.wrongProfile}`}</Badge>
              <Badge color="slate">{`only on router: ${report.summary.onlyOnRouter}`}</Badge>
            </div>
            <div className="max-h-72 overflow-auto">
              <Table
                rowKey="key"
                rows={report.issues.map((i, n) => ({ ...i, key: n }))}
                empty="Everything matches. 🎉"
                columns={[
                  { key: "username", header: "Username" },
                  { key: "customer", header: "Customer", render: (i) => i.customer?.name ?? "—" },
                  { key: "problem", header: "Problem", render: (i) => i.problem.replaceAll("_", " ") },
                  { key: "detail", header: "Detail", className: "whitespace-normal" },
                ]}
              />
            </div>
            {report.summary.onlyOnRouter > 0 && <p className="text-xs text-zinc-500">Secrets only on the router can be imported from Customers → Import → From MikroTik.</p>}
            {report.issues.some((i) => i.customer) && (
              <Button loading={fixAll.isPending} onClick={() => fixAll.mutate(report.router._id)}>
                Fix all (push software data to router)
              </Button>
            )}
          </div>
        )}
      </Modal>
      <Modal open={Boolean(vpnScript)} onClose={() => setVpnScript(null)} title="Router setup script" size="lg">
        <p className="mb-2 text-sm text-zinc-600">Open Winbox → New Terminal on the router and paste this.</p>
        <pre className="max-h-80 overflow-auto rounded bg-[#18181b] p-3 text-xs text-[#e4e4e7] ring-1 ring-line">{vpnScript}</pre>
        <Button className="mt-3" variant="secondary" onClick={() => navigator.clipboard.writeText(vpnScript ?? "")}>
          Copy script
        </Button>
      </Modal>
      <Modal open={Boolean(sessions)} onClose={() => setSessions(null)} title={`Online on ${sessions?.router.name ?? ""}`} size="lg">
        {sessions && (
          <Table
            rowKey="name"
            rows={sessions.rows}
            empty="Nobody is online."
            columns={[
              { key: "name", header: "Username" },
              { key: "address", header: "IP" },
              { key: "callerId", header: "MAC" },
              { key: "uptime", header: "Uptime" },
            ]}
          />
        )}
      </Modal>
    </div>
  );
}
