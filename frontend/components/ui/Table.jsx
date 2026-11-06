/**
 * columns: [{ key, header, render?: (row) => node, className? }]
 */
export function Table({ columns, rows, rowKey = "_id", empty = "No records found.", onRowClick }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`whitespace-nowrap px-4 py-2.5 text-left font-semibold text-slate-600 ${c.className ?? ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row[rowKey]}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? "cursor-pointer hover:bg-purple-50/50" : "hover:bg-slate-50"}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`whitespace-nowrap px-4 py-2.5 text-slate-800 ${c.className ?? ""}`}>
                    {c.render ? c.render(row) : (row[c.key] ?? "—")}
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

export function Pagination({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) {
    return meta ? <p className="mt-3 text-sm text-slate-500">{meta.total} record(s)</p> : null;
  }
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
      <span>
        Page {meta.page} of {meta.totalPages} · {meta.total} record(s)
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
          className="cursor-pointer rounded border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
          className="cursor-pointer rounded border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
