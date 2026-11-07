import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { ActivityLog } from "./activityLog.model";

type Entry = {
  company: string | Types.ObjectId;
  user?: string;
  action: string;
  entity: string;
  entityId?: string;
  summary?: string;
  ip?: string;
  userAgent?: string;
  changes?: { field: string; from?: unknown; to?: unknown }[];
};

/** Never logged, even as "changed". */
const SECRET_FIELDS = /(^|\.)(password|privateKey|apiKey|accessToken|credentials|secret|hash|tokenVersion)$/i;
const IGNORED = new Set(["updatedAt", "__v", "syncStatus", "syncError", "lastLogin"]);

function flatten(obj: unknown, prefix = "", out: Record<string, unknown> = {}) {
  if (obj && typeof obj === "object" && !Array.isArray(obj) && !(obj instanceof Date) && !(obj instanceof Types.ObjectId)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else out[prefix] = obj;
  return out;
}

const norm = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : v instanceof Types.ObjectId ? String(v) : Array.isArray(v) ? JSON.stringify(v.map(norm)) : v);

/** Field-by-field diff of two plain documents (secrets are only reported as changed). */
export function diffDocs(before: unknown, after: unknown) {
  const a = flatten(before);
  const b = flatten(after);
  const changes: { field: string; from?: unknown; to?: unknown }[] = [];
  for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (IGNORED.has(field.split(".")[0]) || field === "_id") continue;
    if (norm(a[field]) === norm(b[field])) continue;
    if (SECRET_FIELDS.test(field)) changes.push({ field, from: "••••", to: "•••• (changed)" });
    else changes.push({ field, from: norm(a[field]), to: norm(b[field]) });
  }
  return changes.slice(0, 50);
}

/**
 * Put before `audit(...)` on an edit route: snapshots the document so the activity log
 * can store exactly which fields changed and from what.
 */
export const trackChanges =
  (model: { findOne(filter: Record<string, unknown>): { lean(): PromiseLike<unknown> } }) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.user && req.params.id && Types.ObjectId.isValid(String(req.params.id))) {
      const filter = { _id: String(req.params.id), company: req.user.company };
      res.locals.auditBefore = await model.findOne(filter).lean();
      res.locals.auditReload = () => model.findOne(filter).lean();
    }
    next();
  };

export function logActivity(entry: Entry) {
  return ActivityLog.create(entry).catch((err) => console.error("[activity] failed to write log:", err));
}

const pickId = (body: unknown): string | undefined => {
  const data = (body as { data?: Record<string, unknown> } | undefined)?.data;
  if (!data) return undefined;
  const candidate = (data._id ?? (data.customer as { _id?: unknown })?._id ?? (data.payment as { _id?: unknown })?._id) as
    | { toString(): string }
    | undefined;
  return candidate?.toString();
};

/**
 * Route middleware: after a successful (2xx) response, record who did what.
 * Handlers may set res.locals.auditSummary for a human-readable line.
 */
export const audit =
  (action: string, entity: string) => (req: Request, res: Response, next: NextFunction) => {
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      res.locals.auditBody = body;
      return json(body);
    };
    res.on("finish", async () => {
      if (res.statusCode >= 400 || !req.user) return;
      const body = res.locals.auditBody as { message?: string } | undefined;
      let changes: Entry["changes"];
      if (res.locals.auditReload) {
        const after = await (res.locals.auditReload as () => Promise<unknown>)().catch(() => null);
        if (after) changes = diffDocs(res.locals.auditBefore, after);
      }
      void logActivity({
        changes,
        company: req.user.company,
        user: req.user.id,
        action,
        entity,
        entityId: req.params.id ? String(req.params.id) : pickId(body),
        summary: `${req.user.impersonatedBy ? "[by platform admin] " : ""}${(res.locals.auditSummary as string | undefined) ?? body?.message ?? ""}`,
        ip: req.ip,
        userAgent: req.get("user-agent")?.slice(0, 300),
      });
    });
    next();
  };
