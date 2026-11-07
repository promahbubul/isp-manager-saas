import { NextFunction, Request, Response } from "express";
import { model, Schema, Types } from "mongoose";

/** Everything platform staff change (tenant actions, plans, gateways, impersonation). */
export interface IPlatformAuditLog {
  platformUser: Types.ObjectId;
  action: string;
  target: string;
  targetId?: string;
  company?: Types.ObjectId;
  summary?: string;
  ip?: string;
}

const schema = new Schema<IPlatformAuditLog>(
  {
    platformUser: { type: Schema.Types.ObjectId, ref: "PlatformUser", required: true },
    action: { type: String, required: true },
    target: { type: String, required: true },
    targetId: String,
    company: { type: Schema.Types.ObjectId, ref: "Company" },
    summary: { type: String, maxlength: 500 },
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ createdAt: -1 });
schema.index({ company: 1, createdAt: -1 });

export const PlatformAuditLog = model<IPlatformAuditLog>("PlatformAuditLog", schema);

/**
 * Route middleware: after a 2xx response, record the action.
 * `companyFromParam` marks the :id param as a company id (for the tenant timeline).
 */
export const platformAudit =
  (action: string, target: string, companyFromParam = false) =>
  (req: Request, res: Response, next: NextFunction) => {
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      res.locals.auditBody = body;
      return json(body);
    };
    res.on("finish", () => {
      if (res.statusCode >= 400 || !req.platformUser) return;
      const id = req.params.id ? String(req.params.id) : req.params.gateway ? String(req.params.gateway) : undefined;
      const body = res.locals.auditBody as { message?: string } | undefined;
      void PlatformAuditLog.create({
        platformUser: req.platformUser.id,
        action,
        target,
        targetId: id,
        company: companyFromParam && id && Types.ObjectId.isValid(id) ? id : undefined,
        summary: (res.locals.auditSummary as string | undefined) ?? body?.message,
        ip: req.ip,
      }).catch((err) => console.error("[platform-audit]", err));
    });
    next();
  };
