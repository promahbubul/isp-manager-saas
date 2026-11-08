"use client";

import { Activity, ChevronDown, ChevronRight, CreditCard, Gauge, History, KeyRound, LifeBuoy, LogOut, MessageSquareWarning, Receipt, RefreshCw, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PortalShell from "@/components/portal/PortalShell";
import { CATEGORIES } from "@/components/ticket/TicketForm";
import { Badge, Button, ErrorBox, Input, Loading, Modal, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { daysUntil, formatDate, formatDateTime, taka, methodLabel } from "@/lib/format";
import { getPortalToken, setPortalToken } from "@/lib/portalApi";
import { usePortal, usePortalMutation } from "@/lib/portalHooks";

const STATUS = {
  active: { label: "Active", dot: "bg-emerald-400" },
  expired: { label: "Expired", dot: "bg-rose-400" },
  disabled: { label: "Disabled", dot: "bg-zinc-300" },
  free: { label: "Free", dot: "bg-sky-300" },
};
const TICKET_STATUS = { open: ["Received", "red"], in_progress: ["Working on it", "amber"], solved: ["Solved", "green"], closed: ["Closed", "slate"] };

/** White panel used for every block below the hero. */
function Panel({ title, action, children, className }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** One expandable row: icon + title + hint, opens its content below. */
function Row({ icon: Icon, title, hint, open, onToggle, children }) {
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-subtle">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-subtle text-ink">
          <Icon className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{title}</span>
          {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

function Payments({ slug, account }) {
  const { data, isLoading, error } = usePortal(slug, ["payments", account._id], `/accounts/${account._id}/payments`);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const rows = data.data;
  if (!rows.length) return <p className="py-2 text-sm text-muted">No payments yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((p) => (
        <li key={p._id}>
          <Link href={`/portal/${slug}/receipt/${p._id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-subtle">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Receipt className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{methodLabel(p.method)}</span>
              <span className="block truncate text-xs text-muted">
                {formatDateTime(p.createdAt)}
                {p.newExpiry ? ` · valid to ${formatDate(p.newExpiry)}` : ""}
              </span>
            </span>
            <span className="text-right">
              <span className="tabular block text-sm font-semibold text-ink">{taka(p.amount)}</span>
              <span className="block text-[11px] text-muted">{p.receiptNo}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const gb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);

/** Live from the router — only loaded when the customer asks. */
function LiveUsage({ slug, account }) {
  const { data, isFetching, refetch } = usePortal(slug, ["live", account._id], `/accounts/${account._id}/live`, { staleTime: 0 });
  const l = data?.data;
  if (isFetching && !l) return <Loading />;
  if (l?.online === true) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge color="green" dot>
            Online
          </Badge>
          <button type="button" className="ml-auto inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-muted hover:text-ink" onClick={() => refetch()}>
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} /> Refresh
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-subtle p-3">
            <dt className="text-xs text-muted">IP address</dt>
            <dd className="mt-0.5 font-mono text-[13px] text-ink">{l.ip ?? "—"}</dd>
          </div>
          <div className="rounded-xl bg-subtle p-3">
            <dt className="text-xs text-muted">Connected for</dt>
            <dd className="mt-0.5 font-medium text-ink">{l.uptime ?? "—"}</dd>
          </div>
          {l.downloadBytes != null && (
            <>
              <div className="rounded-xl bg-subtle p-3">
                <dt className="text-xs text-muted">Downloaded</dt>
                <dd className="tabular mt-0.5 font-medium text-ink">{gb(l.downloadBytes)}</dd>
              </div>
              <div className="rounded-xl bg-subtle p-3">
                <dt className="text-xs text-muted">Uploaded</dt>
                <dd className="tabular mt-0.5 font-medium text-ink">{gb(l.uploadBytes)}</dd>
              </div>
            </>
          )}
        </dl>
        <p className="text-xs text-muted">Usage is for the current session.</p>
      </div>
    );
  }
  if (l?.online === false) {
    return (
      <div className="flex gap-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
        <WifiOff className="mt-0.5 size-4 shrink-0" />
        <p>Your router is not connected right now. Restart it; if it still does not connect, report a problem below.</p>
      </div>
    );
  }
  return <p className="text-sm text-muted">{l?.error ?? "Live status is not available."}</p>;
}

function PackageChange({ slug, account }) {
  const [pkg, setPkg] = useState("");
  const pkgs = usePortal(slug, ["packages", account._id], `/accounts/${account._id}/packages`);
  const pending = usePortal(slug, "package-requests", "/package-requests");
  const mine = (pending.data?.data ?? []).find((r) => r.customer === account._id);
  const send = usePortalMutation(slug, (api) => api.post(`/accounts/${account._id}/package-request`, { package: pkg }), { invalidate: ["package-requests"] });
  if (mine) {
    return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Change to {mine.toPackage?.name} requested — {"we'll"} confirm it soon.</p>;
  }
  if (pkgs.isLoading) return <Loading />;
  const options = (pkgs.data?.data ?? []).filter((p) => p._id !== (account.package?._id ?? account.package));
  if (!options.length) return <p className="text-sm text-muted">No other packages are available right now.</p>;
  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        {options.map((p) => (
          <label
            key={p._id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
              pkg === p._id ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]" : "border-line hover:bg-subtle",
            )}
          >
            <input type="radio" name="pkg" value={p._id} checked={pkg === p._id} onChange={() => setPkg(p._id)} className="size-4 accent-[var(--brand)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{p.name}</span>
              <span className="block text-xs text-muted">{p.speedDown} Mbps</span>
            </span>
            <span className="tabular text-sm font-semibold text-ink">
              {taka(p.price)}
              <span className="text-xs font-normal text-muted">/mo</span>
            </span>
          </label>
        ))}
      </div>
      <Button className="w-full" disabled={!pkg} loading={send.isPending} onClick={() => send.mutate()}>
        Request change
      </Button>
    </div>
  );
}

function AccountSettings({ slug, account }) {
  const [p, setP] = useState({ altPhone: account.altPhone ?? "", email: account.email ?? "" });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const save = usePortalMutation(slug, (api) => api.patch(`/accounts/${account._id}/profile`, p), { invalidate: ["me"] });
  const change = usePortalMutation(slug, (api) => api.post(`/accounts/${account._id}/password`, pw), { onSuccess: () => setPw({ currentPassword: "", newPassword: "" }) });
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Second mobile" value={p.altPhone} onChange={(e) => setP({ ...p, altPhone: e.target.value })} />
          <Input label="Email" type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} />
        </div>
        <p className="text-xs text-muted">To change your main mobile number, contact us.</p>
        <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate()}>
          Save details
        </Button>
      </div>
      {account.connectionType === "pppoe" && (
        <div className="space-y-3 border-t border-line pt-5">
          <p className="text-sm font-semibold text-ink">Internet (PPPoE) password</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Current password" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            <Input label="New password" type="password" autoComplete="new-password" hint="At least 6 characters" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </div>
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">After changing it, enter the new password in your WiFi router&apos;s PPPoE settings, or the internet will stop.</p>
          <Button variant="secondary" disabled={!pw.currentPassword || pw.newPassword.length < 6} loading={change.isPending} onClick={() => change.mutate()}>
            Change password
          </Button>
        </div>
      )}
    </div>
  );
}

/** Brand-coloured summary: validity countdown, bill and the main call to action. */
function Hero({ slug, account, phone, payUrl }) {
  const st = STATUS[account.status] ?? { label: account.status, dot: "bg-zinc-300" };
  const days = daysUntil(account.expiryDate);
  const free = account.status === "free";
  const monthly = Math.max(0, account.monthlyFee - (account.discount ?? 0));
  const cycle = account.package?.validityDays || 30;
  const pct = free ? 100 : Math.max(0, Math.min(100, (days / cycle) * 100));
  const payHref = `/pay/${slug}?c=${encodeURIComponent(account.customerId)}&p=${encodeURIComponent(account.phone ?? phone ?? "")}`;

  return (
    <section className="relative overflow-hidden rounded-3xl bg-[var(--brand)] p-5 text-white shadow-lg sm:p-6">
      {/* soft light + depth on top of the ISP colour */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/25" />
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/10 blur-2xl" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-white/75">{account.customerId}{account.pppoe?.username ? ` · ${account.pppoe.username}` : ""}</p>
            <p className="truncate text-xl font-semibold">{account.name}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium ring-1 ring-white/25 backdrop-blur">
            <span className={cn("size-1.5 rounded-full", st.dot)} />
            {st.label}
          </span>
        </div>

        <div className="mt-6">
          <p className="text-sm text-white/75">{free ? "Validity" : days < 0 ? "Expired" : "Time left"}</p>
          <p className="tabular mt-0.5 text-4xl font-semibold tracking-tight">
            {free ? "No expiry" : days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago` : days === 0 ? "Ends today" : `${days} day${days === 1 ? "" : "s"}`}
          </p>
          {!free && (
            <>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-white/75">{days < 0 ? "Expired on" : "Valid until"} {formatDate(account.expiryDate)}</p>
            </>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-black/15 p-3 ring-1 ring-white/10">
            <p className="text-xs text-white/70">Monthly bill</p>
            <p className="tabular mt-0.5 text-lg font-semibold">{taka(monthly)}</p>
          </div>
          <div className="rounded-2xl bg-black/15 p-3 ring-1 ring-white/10">
            <p className="text-xs text-white/70">Due</p>
            <p className="tabular mt-0.5 text-lg font-semibold">{taka(account.dueAmount)}</p>
          </div>
        </div>

        {payUrl && !free && (
          <a href={payHref} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-[15px] font-semibold text-zinc-900 shadow-sm transition hover:bg-white/90 dark:text-[#18181b]">
            <CreditCard className="size-4.5" /> Pay bill now
          </a>
        )}
      </div>
    </section>
  );
}

function Connection({ slug, account, phone, payUrl, onReport, ticketsOn }) {
  const [open, setOpen] = useState(null);
  const toggle = (k) => setOpen((o) => (o === k ? null : k));
  const pppoe = !account.connectionType || account.connectionType === "pppoe";

  return (
    <div className="space-y-4">
      <Hero slug={slug} account={account} phone={phone} payUrl={payUrl} />

      {/* quick actions */}
      <div className={cn("grid gap-3", { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" }[1 + Number(pppoe) + Number(ticketsOn)])}>
        <QuickAction icon={History} label="Payments" onClick={() => setOpen("payments")} active={open === "payments"} />
        {pppoe && <QuickAction icon={Activity} label="Connection" onClick={() => setOpen("live")} active={open === "live"} />}
        {ticketsOn && <QuickAction icon={LifeBuoy} label="Get help" onClick={onReport} />}
      </div>

      <Panel>
        <dl className="grid grid-cols-2 divide-x divide-line">
          <div className="p-4">
            <dt className="text-xs text-muted">Package</dt>
            <dd className="mt-0.5 truncate text-sm font-semibold text-ink">{account.package?.name ?? "—"}</dd>
          </div>
          <div className="p-4">
            <dt className="text-xs text-muted">Speed</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Gauge className="size-4 text-muted" />
              {account.package ? `${account.package.speedDown} Mbps` : "—"}
            </dd>
          </div>
        </dl>
        <div className="divide-y divide-line border-t border-line">
          <Row icon={History} title="Payment history" hint="Receipts for every payment" open={open === "payments"} onToggle={() => toggle("payments")}>
            <Payments slug={slug} account={account} />
          </Row>
          {pppoe && (
            <Row icon={Wifi} title="Check my connection" hint="Live status from the network" open={open === "live"} onToggle={() => toggle("live")}>
              <LiveUsage slug={slug} account={account} />
            </Row>
          )}
          <Row icon={Gauge} title="Change package" hint="Faster speed or a different plan" open={open === "package"} onToggle={() => toggle("package")}>
            <PackageChange slug={slug} account={account} />
          </Row>
          <Row icon={KeyRound} title="My details & password" hint="Email, second mobile, internet password" open={open === "settings"} onToggle={() => toggle("settings")}>
            <AccountSettings slug={slug} account={account} />
          </Row>
        </div>
      </Panel>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border bg-surface px-2 py-4 text-sm font-medium text-ink shadow-[var(--shadow-card)] transition-colors hover:bg-subtle",
        active ? "border-[var(--brand)]" : "border-line",
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)] dark:text-white">
        <Icon className="size-5" />
      </span>
      {label}
    </button>
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

function Complaints({ slug, accounts, onReport }) {
  const { data, isLoading, error } = usePortal(slug, "tickets", "/tickets");
  return (
    <Panel
      title="Complaints"
      action={
        <Button size="sm" variant="secondary" onClick={onReport}>
          <MessageSquareWarning /> Report a problem
        </Button>
      }
    >
      <div className="px-5 pb-4 pt-2">
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorBox error={error} />
        ) : data.data.length === 0 ? (
          <p className="py-2 text-sm text-muted">No complaints. If your internet is not working, report it here and we will be notified right away.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.data.map((t) => {
              const [label, color] = TICKET_STATUS[t.status] ?? [t.status, "slate"];
              return (
                <li key={t._id}>
                  <Link href={`/portal/${slug}/tickets/${t._id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-subtle">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{t.subject}</p>
                      <p className="truncate text-xs text-muted">
                        {t.ticketNo} · {formatDateTime(t.createdAt)}
                        {accounts.length > 1 && t.customer ? ` · ${t.customer.name}` : ""}
                      </p>
                    </div>
                    <Badge color={color} dot>
                      {label}
                    </Badge>
                    <ChevronRight className="size-4 shrink-0 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}

export default function PortalAccountPage() {
  const { slug } = useParams();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [reporting, setReporting] = useState(false);
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
  const ticketsOn = Boolean(me.features.tickets && me.accounts.length > 0);

  return (
    <PortalShell
      isp={isp}
      actions={
        <Button variant="ghost" size="icon" onClick={logout} aria-label="Log out" title="Log out">
          <LogOut />
        </Button>
      }
    >
      <div className="space-y-6">
        <p className="text-sm text-muted">
          Signed in as <span className="font-medium text-ink">{me.phone ?? me.accounts[0]?.pppoe?.username}</span>
        </p>
        {me.accounts.length === 0 && <ErrorBox>No active connection is registered with this number. Please contact {me.company?.name}.</ErrorBox>}
        {me.accounts.map((a) => (
          <Connection key={a._id} slug={slug} account={a} phone={me.phone} payUrl={me.payUrl} ticketsOn={ticketsOn} onReport={() => setReporting(true)} />
        ))}
        {ticketsOn && <Complaints slug={slug} accounts={me.accounts} onReport={() => setReporting(true)} />}
      </div>
      {reporting && <NewComplaint slug={slug} accounts={me.accounts} onClose={() => setReporting(false)} />}
    </PortalShell>
  );
}
