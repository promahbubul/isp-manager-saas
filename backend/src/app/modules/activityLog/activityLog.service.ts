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
    res.on("finish", () => {
      if (res.statusCode >= 400 || !req.user) return;
      const body = res.locals.auditBody as { message?: string } | undefined;
      void logActivity({
        company: req.user.company,
        user: req.user.id,
        action,
        entity,
        entityId: req.params.id ? String(req.params.id) : pickId(body),
        summary: (res.locals.auditSummary as string | undefined) ?? body?.message,
        ip: req.ip,
        userAgent: req.get("user-agent")?.slice(0, 300),
      });
    });
    next();
  };
