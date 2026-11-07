"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PortalShell from "@/components/portal/PortalShell";
import { CATEGORIES } from "@/components/ticket/TicketForm";
import { Badge, Button, Card, ErrorBox, Input, Loading, Modal, Select, Textarea } from "@/components/ui";
import { daysUntil, formatDate, formatDateTime, taka } from "@/lib/format";
import { getPortalToken, setPortalToken } from "@/lib/portalApi";
import { usePortal, usePortalMutation } from "@/lib/portalHooks";

const STATUS = {
  active: { label: "Active", color: "green" },
  expired: { label: "Expired", color: "red" },
  disabled: { label: "Disabled", color: "slate" },
  free: { label: "Free", color: "blue" },
};
const TICKET_STATUS = { open: ["Received", "red"], in_progress: ["Working on it", "amber"], solved: ["Solved", "green"], closed: ["Closed", "slate"] };

function Payments({ slug, account }) {
  const { data, isLoading, error } = usePortal(slug, ["payments", account._id], `/accounts/${account._id}/payments`);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const rows = data.data;
  if (!rows.length) return <p className="text-sm text-slate-500">No payments yet.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((p) => (
        <li key={p._id} className="flex items-center justify-between py-2 text-sm">
          <div>
            <p className="font-medium">{taka(p.amount)}</p>
            <p className="text-xs text-slate-500">
              {formatDateTime(p.createdAt)} · {p.method}
              {p.trxId ? ` · ${p.trxId}` : ""}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>{p.receiptNo}</p>
            {p.newExpiry && <p>valid to {formatDate(p.newExpiry)}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

const gb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);

/** Live from the router — only loaded when the customer asks. */
function LiveUsage({ slug, account }) {
  const [on, setOn] = useState(false);
  const { data, isFetching, refetch } = usePortal(slug, ["live", account._id], `/accounts/${account._id}/live`, { enabled: on, staleTime: 0 });
  const l = data?.data;
  if (account.connectionType && account.connectionType !== "pppoe") return null;
  return (
    <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
      {!on ? (
        <button type="button" className="cursor-pointer text-purple-700 hover:underline" onClick={() => setOn(true)}>
          Check my connection now
        </button>
      ) : isFetching && !l ? (
        <Loading />
      ) : l?.online === true ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Badge color="green">online</Badge>
          <span>IP {l.ip}</span>
          <span>up {l.uptime}</span>
          {l.downloadBytes != null && <span>↓ {gb(l.downloadBytes)} · ↑ {gb(l.uploadBytes)} this session</span>}
          <button type="button" className="cursor-pointer text-purple-700 hover:underline" onClick={() => refetch()}>
            refresh
          </button>
        </div>
      ) : l?.online === false ? (
        <p>
          <Badge color="red">offline</Badge> Your router is not connected right now. Restart it; if it still does not connect, report a problem below.
        </p>
      ) : (
        <p className="text-slate-500">{l?.error ?? "Live status is not available."}</p>
      )}
    </div>
  );
}

function PackageChange({ slug, account }) {
  const [open, setOpen] = useState(false);
  const [pkg, setPkg] = useState("");
  const pkgs = usePortal(slug, ["packages", account._id], `/accounts/${account._id}/packages`, { enabled: open });
  const pending = usePortal(slug, "package-requests", "/package-requests");
  const mine = (pending.data?.data ?? []).find((r) => r.customer === account._id);
  const send = usePortalMutation(slug, (api) => api.post(`/accounts/${account._id}/package-request`, { package: pkg }), { invalidate: ["package-requests"], onSuccess: () => setOpen(false) });
  if (mine) return <p className="mt-3 text-sm text-amber-700">Package change to {mine.toPackage?.name} requested — the ISP will confirm.</p>;
  if (!open) {
    return (
      <button type="button" className="mt-3 cursor-pointer text-sm text-purple-700 hover:underline" onClick={() => setOpen(true)}>
        Change package
      </button>
    );
  }
  const options = (pkgs.data?.data ?? []).filter((p) => p._id !== (account.package?._id ?? account.package));
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <Select label="New package" placeholder="— choose —" value={pkg} onChange={(e) => setPkg(e.target.value)} options={options.map((p) => ({ value: p._id, label: `${p.name} · ${p.speedDown} Mbps · ${taka(p.price)}/month` }))} />
      <Button disabled={!pkg} loading={send.isPending} onClick={() => send.mutate()}>
        Request
      </Button>
      <Button variant="secondary" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

function Connection({ slug, account, phone, payUrl }) {
  const [showPayments, setShowPayments] = useState(false);
  const st = STATUS[account.status] ?? { label: account.status, color: "slate" };
  const days = daysUntil(account.expiryDate);
  const monthly = Math.max(0, account.monthlyFee - (account.discount ?? 0));
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{account.name}</p>
          <p className="text-sm text-slate-500">
            {account.customerId}
            {account.pppoe?.username ? ` · ${account.pppoe.username}` : ""}
          </p>
        </div>
        <Badge color={st.color}>{st.label}</Badge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Package</dt>
          <dd className="font-semibold">{account.package?.name ?? "—"}</dd>
          {account.package && <dd className="text-xs text-slate-500">{account.package.speedDown} Mbps</dd>}
        </div>
        <div>
          <dt className="text-slate-500">Monthly bill</dt>
          <dd className="font-semibold">{taka(monthly)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{account.status === "free" ? "Validity" : days < 0 ? "Expired on" : "Valid until"}</dt>
          <dd className={`font-semibold ${days < 0 ? "text-red-600" : days <= 3 ? "text-amber-600" : ""}`}>{account.status === "free" ? "No expiry" : formatDate(account.expiryDate)}</dd>
          {account.status !== "free" && days >= 0 && <dd className="text-xs text-slate-500">{days === 0 ? "ends today" : `${days} day(s) left`}</dd>}
        </div>
        <div>
          <dt className="text-slate-500">Due</dt>
          <dd className={`font-semibold ${account.dueAmount > 0 ? "text-red-600" : ""}`}>{taka(account.dueAmount)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {payUrl && account.status !== "free" && (
          <a
            href={`/pay/${slug}?c=${encodeURIComponent(account.customerId)}&p=${encodeURIComponent(phone)}`}
            className="inline-flex items-center rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-800"
          >
            Pay bill
          </a>
        )}
        <Button variant="secondary" onClick={() => setShowPayments((v) => !v)}>
          {showPayments ? "Hide payments" : "Payment history"}
        </Button>
      </div>
      {showPayments && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <Payments slug={slug} account={account} />
        </div>
      )}
      <LiveUsage slug={slug} account={account} />
      <PackageChange slug={slug} account={account} />
    </Card>
  );
}

function NewComplaint({ slug, accounts, onClose }) {
  const router = useRouter();
  const [f, setF] = useState({ account: accounts[0]?._id ?? "", category: "no_internet", subject: "", description: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const create = usePortalMutation(slug, (api) => api.post("/tickets", f), {
    invalidate: ["tickets"],
    onSuccess: (res) => router.push(`/portal/${slug}/tickets/${res.data._id}`),
  });
  return (
    <Modal open onClose={onClose} title="Report a problem">
      <div className="space-y-4">
        {accounts.length > 1 && <Select label="Connection" value={f.account} onChange={set("account")} options={accounts.map((a) => ({ value: a._id, label: `${a.name} (${a.customerId})` }))} />}
        <Select label="Problem" value={f.category} onChange={set("category")} options={CATEGORIES} />
        <Input label="Short title" placeholder="e.g. No internet since morning" value={f.subject} onChange={set("subject")} />
        <Textarea label="Details (optional)" rows={4} value={f.description} onChange={set("description")} />
        <Button className="w-full" size="lg" disabled={f.subject.trim().length < 3} loading={create.isPending} onClick={() => create.mutate()}>
          Submit
        </Button>
      </div>
    </Modal>
  );
}

function Complaints({ slug, accounts }) {
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = usePortal(slug, "tickets", "/tickets");
  return (
    <Card
      title={
        <span className="flex items-center justify-between">
          Complaints
          <Button size="sm" onClick={() => setCreating(true)}>
            + Report a problem
          </Button>
        </span>
      }
    >
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} />
      ) : data.data.length === 0 ? (
        <p className="text-sm text-slate-500">No complaints. If your internet is not working, report it here and the ISP will be notified.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.data.map((t) => {
            const [label, color] = TICKET_STATUS[t.status] ?? [t.status, "slate"];
            return (
              <li key={t._id}>
                <Link href={`/portal/${slug}/tickets/${t._id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.subject}</p>
                    <p className="text-xs text-slate-500">
                      {t.ticketNo} · {formatDateTime(t.createdAt)}
                      {accounts.length > 1 && t.customer ? ` · ${t.customer.name}` : ""}
                    </p>
                  </div>
                  <Badge color={color}>{label}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {creating && <NewComplaint slug={slug} accounts={accounts} onClose={() => setCreating(false)} />}
    </Card>
  );
}

export default function PortalAccountPage() {
  const { slug } = useParams();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getPortalToken(slug)) router.replace(`/portal/${slug}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- token lives in localStorage, only readable after mount
    else setReady(true);
  }, [slug, router]);
  const { data, isLoading, error } = usePortal(slug, "me", "/me", { enabled: ready });

  const logout = () => {
    setPortalToken(slug, null);
    router.replace(`/portal/${slug}`);
  };

  if (!ready || isLoading) return <Loading />;
  if (error) {
    return (
      <PortalShell>
        <ErrorBox error={error} />
        <Button className="mt-4" variant="secondary" onClick={logout}>
          Log out
        </Button>
      </PortalShell>
    );
  }
  const me = data.data;
  const isp = { ...me.company };

  return (
    <PortalShell
      isp={isp}
      actions={
        <button type="button" onClick={logout} className="cursor-pointer rounded border border-white/60 px-3 py-1 text-sm hover:bg-white/10">
          Log out
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Logged in as {me.phone}</p>
        {me.accounts.length === 0 && <ErrorBox>No active connection is registered with this number. Please contact {me.company?.name}.</ErrorBox>}
        {me.accounts.map((a) => (
          <Connection key={a._id} slug={slug} account={a} phone={me.phone} payUrl={me.payUrl} />
        ))}
        {me.features.tickets && me.accounts.length > 0 && <Complaints slug={slug} accounts={me.accounts} />}
      </div>
    </PortalShell>
  );
}
