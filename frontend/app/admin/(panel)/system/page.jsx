"use client";

import Link from "next/link";
import { Badge, Button, Card, ErrorBox, InfoList, Loading, PageHeader, Table } from "@/components/ui";
import { useAdminApi } from "@/lib/adminHooks";
import { formatDateTime } from "@/lib/format";

const Ok = ({ s }) => (s?.ok ? <Badge color="green">OK</Badge> : <Badge color={s?.warn ? "amber" : "red"}>Check</Badge>);
const ago = (d) => {
  if (!d) return "never";
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  return min < 60 ? `${min} min ago` : min < 48 * 60 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
};
const uptime = (s) => (s > 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);

function Section({ title, s, children }) {
  return (
    <Card title={<span className="flex items-center gap-2">{title} <Ok s={s} /></span>}>
      {s?.warn && <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{s.warn}</p>}
      {children}
    </Card>
  );
}

export default function SystemHealthPage() {
  // Refresh every minute while the page is open.
  const { data, isLoading, error, refetch, isFetching } = useAdminApi("system-health", "/admin/system/health", undefined, { refetchInterval: 60_000 });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const h = data.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System health"
        subtitle={`Checked ${formatDateTime(h.checkedAt)} · refreshes every minute`}
        actions={
          <Button variant="secondary" loading={isFetching} onClick={() => refetch()}>
            Refresh
          </Button>
        }
      />

      <div className={`rounded-lg px-4 py-3 text-sm font-medium ${h.ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
        {h.ok ? "✅ All systems normal." : `⚠ ${h.warnings.length} thing(s) need attention:`}
        {!h.ok && (
          <ul className="mt-2 list-disc pl-5 font-normal">
            {h.warnings.map((w) => (
              <li key={w.section} className={w.critical ? "font-semibold text-rose-700" : ""}>
                {w.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="API server" s={h.api}>
          <InfoList
            items={[
              { label: "Environment", value: h.api.env },
              { label: "Node.js", value: h.api.node },
              { label: "Uptime (this instance)", value: uptime(h.api.uptimeSec) },
              { label: "Memory (RSS / heap)", value: `${h.api.rssMB} MB / ${h.api.heapUsedMB} MB` },
              { label: "Server load (1 min)", value: `${h.api.host.load1} on ${h.api.host.cpus} CPU` },
              { label: "Server free memory", value: `${h.api.host.freeMemMB} / ${h.api.host.totalMemMB} MB` },
            ]}
          />
        </Section>
        <Section title="Database" s={h.database}>
          <InfoList
            items={[
              { label: "Ping", value: h.database.pingMs != null ? `${h.database.pingMs} ms` : "—" },
              { label: "Replica set", value: h.database.replicaSet ?? "none" },
              { label: "Members", value: h.database.members },
              { label: "Documents", value: h.database.documents?.toLocaleString() },
              { label: "Data / storage / index", value: h.database.dataMB != null ? `${h.database.dataMB} / ${h.database.storageMB} / ${h.database.indexMB} MB` : "—" },
            ]}
          />
        </Section>
      </div>

      <Section title="Background jobs (worker)" s={h.jobs}>
        <Table
          rowKey="name"
          rows={h.jobs.list ?? []}
          columns={[
            { key: "name", header: "Job", render: (j) => <strong>{j.name}</strong> },
            { key: "schedule", header: "Schedule", render: (j) => <code className="text-xs">{j.schedule}</code> },
            { key: "last", header: "Last run", render: (j) => <span title={formatDateTime(j.lastFinishedAt)}>{ago(j.lastFinishedAt)}</span> },
            { key: "dur", header: "Took", render: (j) => (j.lastDurationMs != null ? `${j.lastDurationMs} ms` : "—") },
            {
              key: "state",
              header: "State",
              className: "whitespace-normal",
              render: (j) =>
                j.stale ? <Badge color="red">overdue</Badge> : j.lastOk === false ? <span className="text-rose-700">failed: {j.lastError}</span> : <Badge color="green">ok</Badge>,
            },
            { key: "runs", header: "Runs / failed", render: (j) => `${j.runs} / ${j.failures}` },
          ]}
        />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="MikroTik routers" s={h.routers}>
          <p className="mb-3 text-sm text-zinc-600">
            Online {h.routers.counts?.online ?? 0} · offline {h.routers.counts?.offline ?? 0} · never checked {h.routers.counts?.unknown ?? 0}
          </p>
          {h.routers.offline?.length > 0 && (
            <Table
              rows={h.routers.offline}
              columns={[
                { key: "company", header: "ISP", render: (r) => (r.company ? <Link className="text-primary-700" href={`/admin/companies/${r.company._id}`}>{r.company.name}</Link> : "—") },
                { key: "name", header: "Router", render: (r) => `${r.name} (${r.host})` },
                { key: "lastCheckedAt", header: "Checked", render: (r) => ago(r.lastCheckedAt) },
                { key: "lastError", header: "Error", className: "max-w-xs truncate" },
              ]}
            />
          )}
        </Section>
        <Section title="Customer → MikroTik sync" s={h.customerSync}>
          <p className="mb-3 text-sm text-zinc-600">
            Pending {h.customerSync.pending ?? 0} · failed {h.customerSync.failed ?? 0} (retried every 10 min)
          </p>
          {h.customerSync.topFailing?.length > 0 && (
            <Table
              rows={h.customerSync.topFailing.map((r, i) => ({ ...r, _id: r.company?._id ?? i }))}
              columns={[
                { key: "company", header: "ISP", render: (r) => (r.company ? <Link className="text-primary-700" href={`/admin/companies/${r.company._id}`}>{r.company.name}</Link> : "—") },
                { key: "failed", header: "Failed customers" },
              ]}
            />
          )}
        </Section>
        <Section title="SMS (last 24 hours)" s={h.sms}>
          <InfoList
            items={[
              { label: "Provider", value: h.sms.provider },
              { label: "Sent", value: h.sms.last24h?.sent },
              { label: "Failed", value: h.sms.last24h?.failed },
              { label: "Queued", value: h.sms.last24h?.queued },
              { label: "Stuck > 15 min", value: h.sms.stuck },
            ]}
          />
        </Section>
        <Section title="Payments" s={h.payments}>
          <InfoList
            items={[
              { label: "Manual payments to review (platform)", value: h.payments.pendingReviewPlatform ? <Link className="text-primary-700" href="/admin/payments">{h.payments.pendingReviewPlatform}</Link> : 0 },
              { label: "Manual payments ISPs must review", value: h.payments.pendingReviewIsp },
              { label: "Abandoned checkouts (7 days)", value: h.payments.abandoned7d },
              { label: "Failed (24 h)", value: h.payments.failed24h },
            ]}
          />
        </Section>
        <Section title="ISP support" s={h.support}>
          <InfoList
            items={[
              { label: "Waiting for us", value: <Link className="text-primary-700" href="/admin/support">{h.support.open ?? 0}</Link> },
              { label: "Urgent", value: h.support.urgent ?? 0 },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
