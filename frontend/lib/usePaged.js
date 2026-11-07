"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminApi } from "./adminApi";
import { api } from "./api";

/**
 * Cursor-paginated list.
 *   const list = usePaged("customers", "/customers", { status, search });
 *   <Table rows={list.rows} loading={list.isLoading} indexOffset={list.indexOffset} />
 *   <Pagination {...list.pager} />
 * Filters reset to the first page. The previous page stays on screen while the next
 * one loads (no flicker). `client: "admin"` uses the platform admin API.
 */
export function usePaged(key, url, filters = {}, { defaultLimit = 25, client = "tenant", ...options } = {}) {
  const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "" && v !== undefined && v !== null));
  const filtersKey = JSON.stringify(clean);
  const [state, setState] = useState({ filtersKey, limit: defaultLimit, cursor: null, stack: [] });
  // filters changed → back to page 1 (adjusting state during render, as React recommends)
  if (state.filtersKey !== filtersKey) setState((s) => ({ ...s, filtersKey, cursor: null, stack: [] }));

  const params = { ...clean, limit: state.limit, ...(state.cursor ? { cursor: state.cursor } : {}) };
  const http = client === "admin" ? adminApi : api;
  const baseKey = Array.isArray(key) ? key : [key];
  const query = useQuery({
    queryKey: [...(client === "admin" ? ["admin"] : []), ...baseKey, params],
    queryFn: async () => (await http.get(url, { params })).data,
    placeholderData: keepPreviousData,
    ...options,
  });

  const meta = query.data?.meta;
  const offset = state.stack.length * state.limit;
  const pager = {
    meta,
    onLimit: (limit) => setState((s) => ({ ...s, limit, cursor: null, stack: [] })),
    cursor: {
      offset,
      hasPrev: state.stack.length > 0,
      hasNext: Boolean(meta?.nextCursor),
      onNext: () => meta?.nextCursor && setState((s) => ({ ...s, stack: [...s.stack, s.cursor], cursor: meta.nextCursor })),
      onPrev: () => setState((s) => ({ ...s, cursor: s.stack.at(-1) ?? null, stack: s.stack.slice(0, -1) })),
      onFirst: () => setState((s) => ({ ...s, cursor: null, stack: [] })),
    },
  };

  return { ...query, rows: query.data?.data ?? [], meta, pager, indexOffset: offset };
}
