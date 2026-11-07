"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { Badge, Button, Card, ErrorBox, InfoList, Input, Loading, Modal, PageHeader, Select, StatusBadge, Table } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminApi, useAdminMutation } from "@/lib/adminHooks";
import { getErrorMessage } from "@/lib/api";
import { formatDate, formatDateTime, taka, toDateInput } from "@/lib/format";

const limit = (n) => (n === -1 ? "∞" : n);

function ActionModal({ action, company, plans, onClose }) {
  const [days, setDays] = useState(7);
  const [credits, setCredits] = useState(500);
  const [note, setNote] = useState("");
  const [plan, setPlan] = useState(plans[0]?._id ?? "");
  const [interval, setInterval_] = useState("monthly");
  const [until, setUntil] = useState(() => toDateInput(new Date(Date.now() + 30 * 86_400_000)));
  const inv = [["company", company._id], "companies", "metrics"];
  const extend = useAdminMutation(() => adminApi.post(`/admin/companies/${company._id}/extend-trial`, { days: Number(days) }), { invalidate: inv, onSuccess: onClose });
  const sms = useAdminMutation(() => adminApi.post(`/admin/companies/${company._id}/sms-credits`, { credits: Number(credits), type: "bonus", note }), { invalidate: inv, onSuccess: onClose });
  const assign = useAdminMutation(
    () => adminApi.post(`/admin/companies/${company._id}/assign-plan`, { plan, interval, periodEnd: new Date(`${until}T23:59:59+06:00`), note: note || undefined }),
    { invalidate: inv, onSuccess: onClose },
  );

  const titles = { trial: "Extend trial", sms: "Add / remove SMS credits", plan: "Assign plan manually" };
  return (
    <Modal open onClose={onClose} title={titles[action]}>
      {action === "trial" && (
        <div className="space-y-4">
          <Input label="Extra days" type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} />
          <Button loading={extend.isPending} onClick={() => extend.mutate()}>
            Extend
          </Button>
        </div>
      )}
      {action === "sms" && (
        <div className="space-y-4">
          <Input label="Credits (negative to remove)" type="number" value={credits} onChange={(e) => setCredits(e.target.value)} />
          <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button loading={sms.isPending} onClick={() => sms.mutate()}>
            Apply
          </Button>
        </div>
      )}
      {action === "plan" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">For offline payments or custom contracts. No invoice or gateway charge is created.</p>
          <Select label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)} options={plans.map((p) => ({ value: p._id, label: p.name }))} />
          <Select label="Billing" value={interval} onChange={(e) => setInterval_(e.target.value)} options={[{ value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }]} />
          <Input label="Paid until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          <Input label="Note (contract, receipt no.)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button loading={assign.isPending} onClick={() => assign.mutate()}>
            Assign
          </Button>
        </div>
      )}
    </Modal>
  );
}

export default function CompanyDetailPage() {
  const { id } = useParams();
  const [action, setAction] = useState(null);
  const { data, isLoading, error } = useAdminApi(["company", id], `/admin/companies/${id}`);
  const plans = useAdminApi("plans", "/admin/plans");
  const status = useAdminMutation(({ s, reason }) => adminApi.patch(`/admin/companies/${id}/status`, { status: s, reason }), {
    invalidate: [["company", id], "companies", "metrics"],
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { company: c, owner, subscription: sub, staff, customers, invoices, payments, audit } = data.data;

  const impersonate = async () => {
    if (!confirm(`Open ${c.name}'s panel as the owner? The session lasts 1 hour and every action is logged.`)) return;
    try {
      await adminApi.post(`/admin/companies/${id}/impersonate`);
      window.open("/dashboard", "_blank", "noopener");
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.name}
        subtitle={`${c.slug} · joined ${formatDate(c.createdAt)}`}
        actions={
          <>
            <Button variant="secondary" onClick={impersonate}>
              Log in as owner
            </Button>
            {c.status === "suspended" ? (
              <Button variant="success" onClick={() => status.mutate({ s: "active" })}>
                Activate
              </Button>
            ) : (
              <Button
                variant="danger"
                onClick={() => {
                  const reason = prompt("Reason for suspending (sent to the owner):");
                  if (reason !== null) status.mutate({ s: "suspended", reason });
                }}
              >
                Suspend
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Account">
          <InfoList
            items={[
              { label: "Status", value: <StatusBadge status={c.status === "trial" ? "pending" : c.status === "active" ? "active" : "expired"} /> },
              { label: "Plan", value: sub?.plan ? `${sub.plan.name} (${sub.interval})` : "—" },
              { label: c.status === "trial" ? "Trial ends" : "Paid until", value: formatDate(c.status === "trial" ? c.trialEndsAt : sub?.currentPeriodEnd) },
              { label: "Subscription", value: sub?.status },
              { label: "SMS balance", value: c.smsBalance },
              { label: "BTRC licence", value: c.btrcLicenseNo },
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAction("trial")}>
              Extend trial
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setAction("plan")}>
              Assign plan
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setAction("sms")}>
              SMS credits
            </Button>
          </div>
        </Card>
        <Card title="Owner & contact">
          <InfoList
            items={[
              { label: "Owner", value: owner?.name },
              { label: "Mobile", value: owner?.phone ? <a className="text-purple-700" href={`tel:${owner.phone}`}>{owner.phone}</a> : "—" },
              { label: "Email", value: owner?.email },
              { label: "Last login", value: formatDateTime(owner?.lastLogin) },
              { label: "Company phone", value: c.phone },
              { label: "Address", value: c.address },
            ]}
          />
        </Card>
        <Card title="Usage">
          <InfoList
            items={[
              { label: "Customers", value: `${c.usage.customers} / ${limit(sub?.plan?.limits?.customers ?? 0)}` },
              { label: "Active · expired", value: `${customers.active ?? 0} · ${customers.expired ?? 0}` },
              { label: "Routers", value: `${c.usage.routers} / ${limit(sub?.plan?.limits?.routers ?? 0)}` },
              { label: "Active staff", value: `${staff} / ${limit(sub?.plan?.limits?.staff ?? 0)}` },
            ]}
          />
        </Card>
      </div>

      <Card title="Platform payments">
        <Table
          rows={payments}
          empty="No payments."
          columns={[
            { key: "createdAt", header: "Time", render: (p) => formatDateTime(p.createdAt) },
            { key: "description", header: "For" },
            { key: "amount", header: "Amount", render: (p) => (p.currency === "USD" ? `$${p.amount}` : taka(p.amount)) },
            { key: "gateway", header: "Method" },
            { key: "gatewayTrxId", header: "TrxID" },
            { key: "status", header: "Status", render: (p) => <Badge color={p.status === "success" ? "green" : p.status === "pending_review" ? "amber" : "slate"}>{p.status.replace("_", " ")}</Badge> },
          ]}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Invoices">
          <Table
            rows={invoices}
            empty="No invoices."
            columns={[
              { key: "invoiceNo", header: "Invoice" },
              { key: "planName", header: "Plan", render: (i) => `${i.planName} (${i.interval})` },
              { key: "amount", header: "Amount", render: (i) => (i.currency === "USD" ? `$${i.amount}` : taka(i.amount)) },
              { key: "status", header: "Status" },
            ]}
          />
        </Card>
        <Card title="Admin actions on this ISP">
          <Table
            rows={audit}
            empty="Nothing yet."
            columns={[
              { key: "createdAt", header: "Time", render: (l) => formatDateTime(l.createdAt) },
              { key: "by", header: "By", render: (l) => l.platformUser?.name },
              { key: "summary", header: "What", className: "whitespace-normal", render: (l) => l.summary ?? l.action },
            ]}
          />
        </Card>
      </div>

      {action && <ActionModal action={action} company={c} plans={(plans.data?.data ?? []).filter((p) => !p.isTrial)} onClose={() => setAction(null)} />}
    </div>
  );
}
