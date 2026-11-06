import { Model, QueryFilter } from "mongoose";
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

/**
 * Generic list helper: ?search=&page=&limit=&sort=-createdAt&<filterField>=value
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

  const search = typeof query.search === "string" ? query.search.trim() : "";
  if (search && searchFields.length) {
    const rx = new RegExp(escapeRegex(search), "i");
    const searchOr = searchFields.map((f) => ({ [f]: rx }));
    // Keep an access-scope $or (e.g. technician tickets) instead of overwriting it.
    if (filter.$or) {
      filter.$and = [...((filter.$and as unknown[]) ?? []), { $or: filter.$or }, { $or: searchOr }];
      delete filter.$or;
    } else filter.$or = searchOr;
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || 20));
  const sort =
    typeof query.sort === "string" && /^-?[a-zA-Z0-9_.]+$/.test(query.sort) ? query.sort : defaultSort;

  const q = model
    .find(filter as QueryFilter<T>)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
  if (opts.select) q.select(opts.select);
  for (const p of opts.populate ?? []) q.populate(p);

  const [data, total] = await Promise.all([q.lean<T[]>(), model.countDocuments(filter as QueryFilter<T>)]);
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
