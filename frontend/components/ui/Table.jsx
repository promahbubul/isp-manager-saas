"use client";

import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsUpDown, Inbox, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "./Skeleton";

const PAGE_SIZES = [10, 25, 50, 100];
const NO_SORT = new Set(["__index", "actions", "act", "x", "pay"]);
const sortable = (v) => typeof v === "number" || (typeof v === "string" && v !== "");

/** Text of a row for the quick search: its values and those of nested objects (customer, package...). */
function rowText(row, depth = 0) {
  if (row == null) return "";
  if (typeof row !== "object") return String(row);
  if (depth > 1) return "";
  return Object.entries(row)
    .filter(([k]) => !k.startsWith("_") && k !== "password")
    .map(([, v]) => rowText(v, depth + 1))
    .join(" ");
}
const globalSearch = (row, _id, value) => rowText(row.original).toLowerCase().includes(String(value).trim().toLowerCase());

/**
 * Data table (TanStack Table).
 *   columns: [{ key, header, render?: (row, i) => node, className?, align?: "right",
 *               sortable?: boolean, sortValue?: (row) => string | number }]
 *
 * Client mode (default): click a header to sort; rows are paged in the browser with a
 *   rows-per-page picker once there are more than 10.
 * Server mode: pass `pager` from usePaged() — cursor pagination with rows-per-page; sorting
 *   is then left to the API.
 * Sticky header; `height="screen"` (default) keeps the table inside the viewport
 * (100dvh minus the top bar) and scrolls inside; `height="auto"` grows with the content.
 */
export function Table({
  columns,
  rows,
  rowKey = "_id",
  empty = "No records found.",
  onRowClick,
  showIndex = true,
  indexOffset = 0,
  height = "screen",
  loading = false,
  className,
  pager,
  pageSize: initialPageSize = 10,
  paginate = true,
  search,
}) {
  const server = Boolean(pager);
  const [sorting, setSorting] = useState([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: initialPageSize });
  const [query, setQuery] = useState("");
  // Quick search box for lists loaded in full (server lists have their own filters).
  const searchable = !server && (search ?? rows.length > 8);

  const defs = useMemo(() => {
    const sample = rows.find(Boolean) ?? {};
    const cols = columns.map((c) => ({
      id: c.key,
      header: c.header,
      accessorFn: (row) => (c.sortValue ? c.sortValue(row) : row?.[c.key]),
      enableSorting: !server && !NO_SORT.has(c.key) && (c.sortable ?? (Boolean(c.sortValue) || sortable(sample[c.key]))),
      sortUndefined: "last",
      cell: (ctx) => (c.render ? c.render(ctx.row.original, ctx.row.index) : (ctx.getValue() ?? "—")),
      meta: c,
    }));
    return showIndex ? [{ id: "__index", header: "#", enableSorting: false, cell: () => null, meta: { className: "w-12 text-muted" } }, ...cols] : cols;
  }, [columns, rows, server, showIndex]);

  const clientPaging = !server && paginate && rows.length > PAGE_SIZES[0];
  const table = useReactTable({
    data: rows,
    columns: defs,
    state: { sorting, globalFilter: query, ...(clientPaging ? { pagination } : {}) },
    globalFilterFn: globalSearch,
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(clientPaging ? { getPaginationRowModel: getPaginationRowModel(), autoResetPageIndex: true } : {}),
    getRowId: (row, i) => String(row?.[rowKey] ?? i),
  });

  const visible = table.getRowModel().rows;
  const matched = table.getFilteredRowModel().rows.length;
  const firstIndex = server ? indexOffset : clientPaging ? pagination.pageIndex * pagination.pageSize : indexOffset;
  const hasFooter = server || clientPaging;

  const cells = (row) => row.getVisibleCells().filter((c) => c.column.id !== "__index");
  const actionCell = (row) => cells(row).find((c) => NO_SORT.has(c.column.id) && c.column.id !== "__index");

  return (
    <div data-table className={cn("overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)}>
      {searchable && (
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            placeholder="Search in this list…"
            className="h-8 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-zinc-400"
          />
          {query && <span className="shrink-0 text-xs text-muted">{matched} found</span>}
        </div>
      )}

      {/* Phones: one card per row */}
      <div className="divide-y divide-line sm:hidden">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2 p-4">
              <Skeleton height={14} width="60%" />
              <Skeleton height={12} width="80%" />
            </div>
          ))
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-muted">
            <Inbox className="size-6 text-zinc-300" />
            <span className="text-sm">{query ? "Nothing matches your search." : empty}</span>
          </div>
        ) : (
          visible.map((row) => {
            const [first, ...rest] = cells(row).filter((c) => c !== actionCell(row));
            const act = actionCell(row);
            return (
              <div key={row.id} onClick={onRowClick ? () => onRowClick(row.original) : undefined} className={cn("p-4", onRowClick && "cursor-pointer active:bg-subtle")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 font-medium text-ink">{first && flexRender(first.column.columnDef.cell, first.getContext())}</div>
                  {act && <div className="-mr-2 -mt-1 shrink-0">{flexRender(act.column.columnDef.cell, act.getContext())}</div>}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {rest.map((c) => {
                    const h = c.column.columnDef.header;
                    return (
                      <div key={c.id} className={cn("min-w-0", !h && "col-span-2")}>
                        {h && <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{h}</dt>}
                        <dd className="truncate text-ink">{flexRender(c.column.columnDef.cell, c.getContext())}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            );
          })
        )}
      </div>

      <div className={cn("scroll-thin relative hidden overflow-auto sm:block", height === "screen" && (hasFooter ? "max-h-[calc(100dvh-var(--topbar-h)-5.5rem)]" : "max-h-[calc(100dvh-var(--topbar-h)-2rem)]"))}>
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta ?? {};
                  const can = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={dir ? (dir === "asc" ? "ascending" : "descending") : undefined}
                      className={cn(
                        "sticky top-0 z-10 whitespace-nowrap border-b border-line bg-subtle/95 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur",
                        meta.align === "right" && "text-right",
                        meta.className,
                      )}
                    >
                      {can ? (
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className="group inline-flex cursor-pointer items-center gap-1 uppercase hover:text-ink">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === "asc" ? <ArrowUp className="size-3.5" /> : dir === "desc" ? <ArrowDown className="size-3.5" /> : <ChevronsUpDown className="size-3.5 opacity-0 transition group-hover:opacity-60" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  {defs.map((c) => (
                    <td key={c.id} className="border-b border-line/70 px-4 py-3">
                      <Skeleton height={14} width={c.id === "__index" ? 18 : `${55 + ((i * 7 + c.id.length * 13) % 40)}%`} />
                    </td>
                  ))}
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={defs.length} className="px-4 py-14 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted">
                    <Inbox className="size-6 text-zinc-300" />
                    <span className="text-sm">{query ? "Nothing matches your search." : empty}</span>
                  </div>
                </td>
              </tr>
            ) : (
              visible.map((row, i) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn("transition-colors", onRowClick ? "cursor-pointer hover:bg-primary-50/50" : "hover:bg-subtle/60")}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta ?? {};
                    return (
                      <td key={cell.id} className={cn("tabular whitespace-nowrap border-b border-line/70 px-4 py-2.5 text-ink", meta.align === "right" && "text-right", meta.className)}>
                        {cell.column.id === "__index" ? firstIndex + i + 1 : flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {server && <Pagination {...pager} className="mt-0 border-t border-line px-4 py-2.5" />}
      {clientPaging && (
        <Pagination
          className="mt-0 border-t border-line px-4 py-2.5"
          meta={{ page: pagination.pageIndex + 1, totalPages: table.getPageCount(), total: matched, limit: pagination.pageSize, count: visible.length }}
          onPage={(p) => table.setPageIndex(p - 1)}
          onLimit={(n) => setPagination({ pageIndex: 0, pageSize: n })}
        />
      )}
    </div>
  );
}

/** 1 … 4 5 [6] 7 8 … 20 */
function pageList(page, total) {
  const out = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(total - 1, page + 1);
  if (from > 2) out.push("…l");
  for (let p = from; p <= to; p++) out.push(p);
  if (to < total - 1) out.push("…r");
  if (total > 1) out.push(total);
  return out;
}

const pagerBtn = "inline-flex h-8 min-w-8 cursor-pointer items-center justify-center gap-1 rounded-md border border-line bg-surface px-2 text-sm text-ink shadow-sm transition hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Pagination for both styles:
 *  - cursor (from usePaged): `cursor={{ hasPrev, hasNext, onPrev, onNext, onFirst, offset }}`
 *  - page numbers: `onPage(page)`
 * `onLimit(n)` shows the rows-per-page picker.
 */
export function Pagination({ meta, onPage, cursor, onLimit, className }) {
  if (!meta) return null;
  const limit = meta.limit ?? 25;
  const total = meta.total ?? 0;
  const offset = cursor ? (cursor.offset ?? 0) : ((meta.page || 1) - 1) * limit;
  const shownTo = Math.min(total, offset + (meta.count ?? limit));
  const from = total ? offset + 1 : 0;

  return (
    <div className={cn("mt-3 flex flex-col gap-2.5 text-sm text-muted sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex flex-wrap items-center gap-3">
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
            <span>Rows per page</span>
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
                <button key={p} type="button" onClick={() => onPage(p)} aria-current={p === meta.page ? "page" : undefined} className={cn(pagerBtn, p === meta.page && "border-primary-600 bg-primary-600 text-white hover:bg-primary-700 dark:hover:bg-primary-500")}>
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
