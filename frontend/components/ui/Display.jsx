import { AlertCircle, Inbox } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/** Page title row: title + subtitle on the left, actions on the right (wraps on phones). */
export function PageHeader({ title, subtitle, actions, className }) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClassName }) {
  return (
    <section className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {actions}
        </div>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

const BADGE = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  slate: "bg-zinc-100 text-zinc-700 ring-zinc-500/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  purple: "bg-primary-50 text-primary-700 ring-primary-600/20",
};
const DOT = { green: "bg-emerald-500", red: "bg-rose-500", amber: "bg-amber-500", slate: "bg-zinc-400", blue: "bg-sky-500", purple: "bg-primary-500" };

export function Badge({ color = "slate", children, dot = false, className }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", BADGE[color] ?? BADGE.slate, className)}>
      {dot && <span className={cn("size-1.5 rounded-full", DOT[color] ?? DOT.slate)} />}
      {children}
    </span>
  );
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
  return (
    <Badge color={STATUS_COLORS[status] ?? "slate"} dot>
      {String(status ?? "—").replace("_", " ")}
    </Badge>
  );
}

const TONES = { slate: "text-ink", red: "text-rose-600", green: "text-emerald-600", amber: "text-amber-600", blue: "text-sky-600" };

/** KPI tile. `icon` is a lucide icon component. */
export function Stat({ label, value, hint, href, tone = "slate", icon: Icon }) {
  const body = (
    <div className={cn("flex h-full items-start justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition sm:p-5", href && "hover:border-primary-300 hover:shadow-md")}>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className={cn("tabular mt-1.5 truncate text-xl font-semibold sm:text-2xl", TONES[tone] ?? TONES.slate)}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
      {Icon && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          <Icon className="size-4.5" />
        </span>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Empty({ children = "Nothing here yet.", icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line bg-surface px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-subtle text-muted">
        <Icon className="size-5" />
      </span>
      <p className="max-w-sm text-sm text-muted">{children}</p>
      {action}
    </div>
  );
}

/** Skeleton placeholder while a page or table loads. */
export function Loading({ rows = 6, className }) {
  return (
    <div className={cn("space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4", className)} role="status" aria-label="Loading">
      <div className="h-4 w-1/3 animate-pulse rounded bg-subtle" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-md bg-subtle" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function ErrorBox({ error, children, className }) {
  return (
    <div role="alert" className={cn("flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800", className)}>
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children ?? error?.response?.data?.message ?? error?.message ?? "Something went wrong"}</div>
    </div>
  );
}

/** Two-column label/value list. */
export function InfoList({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items
        .filter((i) => i && !i.hidden)
        .map((i) => (
          <div key={i.label} className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">{i.label}</dt>
            <dd className="mt-1 break-words text-sm text-ink">{i.value ?? "—"}</dd>
          </div>
        ))}
    </dl>
  );
}
