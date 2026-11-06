import Link from "next/link";

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const BADGE = {
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-800",
  slate: "bg-slate-100 text-slate-700",
  blue: "bg-blue-100 text-blue-800",
  purple: "bg-purple-100 text-purple-800",
};

export function Badge({ color = "slate", children }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[color]}`}>{children}</span>;
}

const STATUS_COLORS = {
  active: "green",
  online: "green",
  synced: "green",
  success: "green",
  expired: "red",
  offline: "red",
  failed: "red",
  disabled: "slate",
  left: "slate",
  unknown: "slate",
  pending: "amber",
  free: "blue",
};

export function StatusBadge({ status }) {
  return <Badge color={STATUS_COLORS[status] ?? "slate"}>{status}</Badge>;
}

export function Stat({ label, value, hint, href, tone = "slate" }) {
  const colors = { slate: "text-slate-900", red: "text-red-600", green: "text-emerald-600", amber: "text-amber-600" };
  const body = (
    <div className="h-full rounded-lg border border-slate-200 bg-white p-5 transition hover:border-purple-300">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${colors[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Empty({ children = "Nothing here yet." }) {
  return <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">{children}</div>;
}

export function Loading() {
  return <div className="p-8 text-center text-slate-500">Loading...</div>;
}

export function ErrorBox({ error, children }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      {children ?? error?.response?.data?.message ?? error?.message ?? "Something went wrong"}
    </div>
  );
}

/** Two-column label/value list. */
export function InfoList({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items
        .filter((i) => i && !i.hidden)
        .map((i) => (
          <div key={i.label}>
            <dt className="text-xs uppercase tracking-wide text-slate-500">{i.label}</dt>
            <dd className="mt-0.5 text-slate-900">{i.value ?? "—"}</dd>
          </div>
        ))}
    </dl>
  );
}
