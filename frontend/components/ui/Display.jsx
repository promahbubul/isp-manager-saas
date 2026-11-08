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

/**
 * A titled panel. When its only content is a <Table>, the table goes edge to edge
 * and drops its own border, so there is never a box inside a box.
 */
export function Card({ title, actions, children, className, bodyClassName }) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)] has-[>div>[data-table]:only-child]:overflow-hidden",
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {actions}
        </div>
      )}
      <div
        className={cn(
          "p-4 sm:p-5 has-[>[data-table]:only-child]:p-0 [&>[data-table]:only-child]:rounded-none [&>[data-table]:only-child]:border-0 [&>[data-table]:only-child]:shadow-none",
          bodyClassName,
        )}
      >
        {children}
      </div>
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
  open: "red",
  in_progress: "amber",
  solved: "green",
  closed: "slate",
  trial: "blue",
  paid: "green",
  sent: "green",
  delivered: "green",
  void: "slate",
  unpaid: "amber",
  overdue: "red",
  past_due: "red",
  suspended: "red",
  cancelled: "slate",
  queued: "amber",
  refunded: "slate",
  pending_review: "amber",
  initiated: "slate",
};

export function StatusBadge({ status }) {
  return (
    <Badge color={STATUS_COLORS[status] ?? "slate"} dot>
      {String(status ?? "—").replaceAll("_", " ")}
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

/**
 * Several KPIs in one panel, split by hairlines (2 per row on phones).
 *   <StatGroup><StatCell label="Today" value="৳500" /></StatGroup>
 */
const STAT_COLS = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
};

/** Class list for a StatGroup panel — also usable on a plain <div> wrapping <StatCell>s. */
export const statGroupClass = (cols = 4, className) =>
  cn(
    "grid overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]",
    STAT_COLS[cols] ?? STAT_COLS[4],
    // hairlines between cells, whatever the column count (the outer edge is clipped)
    "[&>*]:-mb-px [&>*]:-mr-px [&>*]:border-b [&>*]:border-r [&>*]:border-line",
    className,
  );

export function StatGroup({ children, className, cols = 4 }) {
  return <div className={statGroupClass(cols, className)}>{children}</div>;
}

export function StatCell({ label, value, hint, href, tone = "slate", icon: Icon }) {
  const body = (
    <div className={cn("flex h-full min-w-0 flex-col gap-1 p-4 sm:p-5", href && "transition-colors hover:bg-subtle")}>
      <div className="flex items-center gap-2 text-muted">
        {Icon && <Icon className="size-4 shrink-0" />}
        <p className="truncate text-xs font-medium sm:text-[13px]">{label}</p>
      </div>
      <p className={cn("tabular truncate text-xl font-semibold tracking-tight sm:text-2xl", TONES[tone] ?? TONES.slate)}>{value}</p>
      {hint && <p className="truncate text-xs text-muted">{hint}</p>}
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
