import { Model, QueryFilter, Types } from "mongoose";
import AppError from "../errors/AppError";
import { PaginationMeta } from "./sendResponse";

type Options = {
  searchFields?: string[];
  /** query keys that may be used as exact-match filters */
  filterFields?: string[];
  defaultSort?: string;
  maxLimit?: number;
  select?: string;
  populate?: { path: string; select?: string }[];
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Cursor = the sort value and _id of the last row of the previous page (opaque to clients). */
type CursorValue = { v: unknown; t?: "d" | "o"; id: string };

function encodeCursor(value: unknown, id: unknown): string {
  const c: CursorValue = { v: value, id: String(id) };
  if (value instanceof Date) {
    c.v = value.toISOString();
    c.t = "d";
  } else if (value instanceof Types.ObjectId) {
    c.v = String(value);
    c.t = "o";
  }
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodeCursor(raw: string): { v: unknown; id: Types.ObjectId } {
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString()) as CursorValue;
    if (!Types.ObjectId.isValid(c.id)) throw new Error("bad id");
    const v = c.t === "d" ? new Date(c.v as string) : c.t === "o" ? new Types.ObjectId(c.v as string) : c.v;
    return { v, id: new Types.ObjectId(c.id) };
  } catch {
    throw new AppError(400, "Invalid pagination cursor");
  }
}

const getPath = (doc: unknown, path: string) => path.split(".").reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), doc);

/**
 * Generic list helper.
 *   ?search=&limit=&sort=-createdAt&<filterField>=value
 *   Cursor mode (recommended — stable and fast on big collections): ?cursor=<meta.nextCursor>
 *   Page mode (kept for old clients): ?page=3
 * Ties on the sort field are broken by _id, so no row is skipped or repeated.
 * Runs inside the tenant context, so the tenant plugin scopes it automatically.
 */
export async function paginate<T>(
  model: Model<T>,
  baseFilter: Record<string, unknown>,
  query: Record<string, unknown>,
  opts: Options = {},
): Promise<{ data: T[]; meta: PaginationMeta }> {
  const { searchFields = [], filterFields = [], defaultSort = "-createdAt", maxLimit = 100 } = opts;
  const filter: Record<string, unknown> = { ...baseFilter };

  for (const key of filterFields) {
    const v = query[key];
    if (typeof v === "string" && v !== "") filter[key] = v;
  }

  const search = typeof query.search === "string" ? query.search.trim().slice(0, 100) : "";
  if (search && searchFields.length) {
    const rx = new RegExp(escapeRegex(search), "i");
    const searchOr = searchFields.map((f) => ({ [f]: rx }));
    // Keep an access-scope $or (e.g. technician tickets) instead of overwriting it.
    if (filter.$or) {
      filter.$and = [...((filter.$and as unknown[]) ?? []), { $or: filter.$or }, { $or: searchOr }];
      delete filter.$or;
    } else filter.$or = searchOr;
  }

  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || 20));
  const sortStr = typeof query.sort === "string" && /^-?[a-zA-Z0-9_.]+$/.test(query.sort) ? query.sort : defaultSort;
  const dir = sortStr.startsWith("-") ? -1 : 1;
  const field = sortStr.replace(/^-/, "");
  const sort: Record<string, 1 | -1> = field === "_id" ? { _id: dir } : { [field]: dir, _id: dir };

  const cursorRaw = typeof query.cursor === "string" && query.cursor ? query.cursor : undefined;
  const page = cursorRaw ? undefined : Math.max(1, Number(query.page) || 1);

  // keyset condition: rows strictly after the cursor in sort order
  let pageFilter: Record<string, unknown> = filter;
  if (cursorRaw) {
    const c = decodeCursor(cursorRaw);
    const op = dir === -1 ? "$lt" : "$gt";
    const after = field === "_id" ? { _id: { [op]: c.id } } : { $or: [{ [field]: { [op]: c.v } }, { [field]: c.v, _id: { [op]: c.id } }] };
    pageFilter = { $and: [filter, after] };
  }

  const q = model
    .find(pageFilter as QueryFilter<T>)
    .sort(sort)
    .limit(limit + 1);
  if (page) q.skip((page - 1) * limit);
  if (opts.select) q.select(opts.select);
  for (const p of opts.populate ?? []) q.populate(p);

  const [rows, total] = await Promise.all([q.lean<T[]>(), model.countDocuments(filter as QueryFilter<T>)]);
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1] as Record<string, unknown> | undefined;
  const nextCursor = hasMore && last ? encodeCursor(field === "_id" ? last._id : getPath(last, field), last._id) : null;

  return {
    data,
    meta: {
      page: page ?? 0,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      count: data.length,
      hasMore,
      nextCursor,
    },
  };
}
