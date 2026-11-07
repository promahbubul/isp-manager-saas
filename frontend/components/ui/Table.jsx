"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, Inbox } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Data table.
 *   columns: [{ key, header, render?: (row, i) => node, className?, align?: "right" }]
 *   - sticky header; the table scrolls inside a box as tall as the screen minus the top bar
 *     (`height="screen"`, the default for page lists) or grows with its content (`height="auto"`)
 *   - a "#" column numbers rows across pages (`indexOffset` = rows before this page)
 */
export function Table({ columns, rows, rowKey = "_id", empty = "No records found.", onRowClick, showIndex = true, indexOffset = 0, height = "screen", loading = false, className }) {
  const cols = showIndex ? [{ key: "__index", header: "#", className: "w-12 text-muted", render: (_r, i) => indexOffset + i + 1 }, ...columns] : columns;
  return (
    <div
      className={cn(
        "scroll-thin relative overflow-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]",
        height === "screen" && "max-h-[calc(100dvh-var(--topbar-h)-2rem)]",
        className,
      )}
    >
      <table className="min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "sticky top-0 z-10 whitespace-nowrap border-b border-line bg-subtle/95 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur",
                  c.align === "right" && "text-right",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 6 }, (_, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.key} className="border-b border-line/70 px-4 py-3">
                    <div className="h-4 animate-pulse rounded bg-subtle" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={cols.length} className="px-4 py-14 text-center">
                <div className="flex flex-col items-center gap-2 text-muted">
                  <Inbox className="size-6 text-zinc-300" />
                  <span className="text-sm">{empty}</span>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row[rowKey] ?? i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn("transition-colors", onRowClick ? "cursor-pointer hover:bg-primary-50/50" : "hover:bg-subtle/60")}
              >
                {cols.map((c) => (
                  <td key={c.key} className={cn("tabular whitespace-nowrap border-b border-line/70 px-4 py-2.5 text-ink", c.align === "right" && "text-right", c.className)}>
                    {c.render ? c.render(row, i) : (row[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const PAGE_SIZES = [10, 25, 50, 100];

/** 1 … 4 5 [6] 7 8 … 20 */
function pageList(page, total) {
  const out = [];
  const add = (p) => out.push(p);
  const from = Math.max(2, page - 1);
  const to = Math.min(total - 1, page + 1);
  add(1);
  if (from > 2) add("…l");
  for (let p = from; p <= to; p++) add(p);
  if (to < total - 1) add("…r");
  if (total > 1) add(total);
  return out;
}

const pagerBtn = "inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md border border-line bg-surface px-2 text-sm text-ink shadow-sm transition hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Pagination for both API styles:
 *  - cursor (recommended, from usePaged): pass `cursor={{ hasPrev, hasNext, onPrev, onNext, onFirst, offset }}`
 *  - page numbers: pass `onPage(page)`
 * `onLimit(n)` shows a rows-per-page picker.
 */
export function Pagination({ meta, onPage, cursor, onLimit, className }) {
  if (!meta) return null;
  const limit = meta.limit ?? 25;
  const total = meta.total ?? 0;
  const offset = cursor ? (cursor.offset ?? 0) : ((meta.page ?? 1) - 1) * limit;
  const shownTo = Math.min(total, offset + (meta.count ?? limit));
  const from = total ? offset + 1 : 0;

  return (
    <div className={cn("mt-3 flex flex-col gap-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex items-center gap-3">
        <span className="tabular">
          {total ? (
            <>
              Showing <span className="font-medium text-ink">{from.toLocaleString()}</span>–<span className="font-medium text-ink">{shownTo.toLocaleString()}</span> of{" "}
              <span className="font-medium text-ink">{total.toLocaleString()}</span>
            </>
          ) : (
            "No records"
          )}
        </span>
        {onLimit && (
          <label className="flex items-center gap-1.5">
            <span className="hidden sm:inline">Rows</span>
            <select className="h-8 cursor-pointer rounded-md border border-line bg-surface px-2 text-sm text-ink" value={limit} onChange={(e) => onLimit(Number(e.target.value))}>
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {cursor ? (
        <div className="flex items-center gap-1.5">
          <button type="button" className={pagerBtn} disabled={!cursor.hasPrev} onClick={cursor.onFirst} aria-label="First page">
            <ChevronsLeft className="size-4" />
          </button>
          <button type="button" className={pagerBtn} disabled={!cursor.hasPrev} onClick={cursor.onPrev}>
            <ChevronLeft className="size-4" /> <span className="hidden sm:inline">Previous</span>
          </button>
          <button type="button" className={pagerBtn} disabled={!cursor.hasNext} onClick={cursor.onNext}>
            <span className="hidden sm:inline">Next</span> <ChevronRight className="size-4" />
          </button>
        </div>
      ) : (
        onPage &&
        (meta.totalPages ?? 1) > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className={pagerBtn} disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </button>
            {pageList(meta.page, meta.totalPages).map((p) =>
              typeof p === "string" ? (
                <span key={p} className="px-1 text-muted">
                  …
                </span>
              ) : (
                <button key={p} type="button" onClick={() => onPage(p)} aria-current={p === meta.page ? "page" : undefined} className={cn(pagerBtn, p === meta.page && "border-primary-600 bg-primary-600 text-white hover:bg-primary-700")}>
                  {p}
                </button>
              ),
            )}
            <button type="button" className={pagerBtn} disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)} aria-label="Next page">
              <ChevronRight className="size-4" />
            </button>
          </div>
        )
      )}
    </div>
  );
}
