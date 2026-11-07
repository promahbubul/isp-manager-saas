import crypto from "node:crypto";
import { NextFunction, Request, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { isValidObjectId, model, Schema, Types } from "mongoose";
import { z } from "zod";
import config from "../../config";
import AppError from "../../errors/AppError";
import { auth, authorize } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { tenantPlugin } from "../../plugins/tenant.plugin";
import sendResponse from "../../utils/sendResponse";
import { tenantStorage } from "../../utils/tenantContext";
import { audit } from "../activityLog/activityLog.service";
import { Company, isCompanyWritable } from "../company/company.model";
import { Customer } from "../customer/customer.model";
import { Actor, CustomerService } from "../customer/customer.service";
import { Package } from "../package/package.model";
import { PaymentService } from "../payment/payment.service";
import { rechargeSchema } from "../payment/payment.validation";
import { hasFeature, requireFeature } from "../subscription/planFeature";
import { User } from "../user/user.model";

/**
 * Public REST API for Enterprise ISPs (plan feature api_access): connect their own
 * website, accounting or a payment kiosk. Keys are shown once and stored hashed.
 */
export const API_SCOPES = ["customers:read", "customers:write", "payments:read", "payments:write"] as const;
type Scope = (typeof API_SCOPES)[number];

export interface IApiKey {
  company: Types.ObjectId;
  name: string;
  prefix: string;
  hash: string;
  scopes: Scope[];
  /** staff user the key acts as (receipts show their name) */
  createdBy: Types.ObjectId;
  lastUsedAt?: Date;
  revokedAt?: Date;
}

const schema = new Schema<IApiKey>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    prefix: { type: String, required: true, unique: true },
    hash: { type: String, required: true, select: false },
    scopes: [{ type: String, enum: API_SCOPES }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastUsedAt: Date,
    revokedAt: Date,
  },
  { timestamps: true },
);
schema.plugin(tenantPlugin);
export const ApiKey = model<IApiKey>("ApiKey", schema);

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/* ───────────── management: /settings/api-keys ───────────── */

export const apiKeyRoutes = Router();
apiKeyRoutes.use(auth(), authorize("setting.manage"), requireFeature("api_access"));

apiKeyRoutes.get("/", async (_req: Request, res: Response) => {
  sendResponse(res, { message: "API keys", data: await ApiKey.find().sort("-createdAt").populate("createdBy", "name") });
});

apiKeyRoutes.post(
  "/",
  validateBody(z.object({ name: z.string().trim().min(2).max(60), scopes: z.array(z.enum(API_SCOPES)).min(1) })),
  audit("api_key.create", "api_key"),
  async (req: Request, res: Response) => {
    if (req.user!.impersonatedBy) throw new AppError(403, "API keys cannot be created while impersonating");
    const prefix = crypto.randomBytes(4).toString("hex");
    const key = `isp_${prefix}_${crypto.randomBytes(24).toString("base64url")}`;
    const doc = await ApiKey.create({ name: req.body.name, scopes: req.body.scopes, prefix, hash: sha256(key), createdBy: req.user!.id });
    sendResponse(res, { statusCode: 201, message: "Copy the key now — it will not be shown again", data: { ...doc.toJSON(), hash: undefined, key } });
  },
);

apiKeyRoutes.delete("/:id", audit("api_key.revoke", "api_key"), async (req: Request, res: Response) => {
  const k = await ApiKey.findOneAndUpdate({ _id: String(req.params.id), revokedAt: null }, { revokedAt: new Date() }, { returnDocument: "after" });
  if (!k) throw new AppError(404, "Key not found or already revoked");
  sendResponse(res, { message: "Key revoked", data: k });
});

/* ───────────── the API itself: /public-api/v1 ───────────── */

async function apiKeyAuth(req: Request, _res: Response, next: NextFunction) {
  const raw = (req.headers["x-api-key"] as string | undefined) ?? (req.headers.authorization?.startsWith("Bearer isp_") ? req.headers.authorization.slice(7) : undefined);
  const m = raw ? /^isp_([0-9a-f]{8})_[\w-]{20,}$/.exec(raw) : null;
  if (!m) throw new AppError(401, "Send your API key in the X-API-Key header");
  const key = await ApiKey.findOne({ prefix: m[1] }).select("+hash");
  if (!key || key.revokedAt || !crypto.timingSafeEqual(Buffer.from(key.hash), Buffer.from(sha256(raw!)))) throw new AppError(401, "Invalid or revoked API key");
  const [company, user] = await Promise.all([Company.findById(key.company), User.findById(key.createdBy).select("role zones isActive")]);
  if (!company || company.deletedAt || company.status === "archived") throw new AppError(403, "Company account is not available");
  if (!(await hasFeature(company._id, "api_access"))) throw new AppError(403, "Your plan does not include API access");
  if (!user?.isActive) throw new AppError(403, "The staff user who created this key is inactive — create a new key");
  void ApiKey.updateOne({ _id: key._id }, { lastUsedAt: new Date() }).catch(() => undefined);
  req.apiKey = {
    id: key.id,
    scopes: key.scopes,
    writable: isCompanyWritable(company),
    actor: { id: String(key.createdBy), role: "admin", company: company.id, zones: [] },
  };
  tenantStorage.run({ companyId: company.id }, () => next());
}

const need = (scope: Scope) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.apiKey!.scopes.includes(scope)) throw new AppError(403, `This key lacks the "${scope}" scope`);
  if (scope.endsWith(":write") && !req.apiKey!.writable) throw new AppError(402, "Your subscription is inactive. Please renew to continue.");
  next();
};

/** Accept our _id or the ISP's customer ID (C-00012). */
async function resolveCustomerId(idOrCode: string) {
  if (isValidObjectId(idOrCode)) return idOrCode;
  const c = await Customer.findOne({ customerId: idOrCode.toUpperCase(), deletedAt: null }).select("_id");
  if (!c) throw new AppError(404, "Customer not found");
  return c.id as string;
}

export const publicApiRoutes = Router();
publicApiRoutes.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => config.isTest,
    keyGenerator: (req) => String(req.headers["x-api-key"] ?? req.headers.authorization ?? req.ip).slice(0, 13),
    message: { success: false, message: "Rate limit: 120 requests per minute per key" },
  }),
  apiKeyAuth,
);

publicApiRoutes.get("/customers", need("customers:read"), async (req: Request, res: Response) => {
  const { data, meta } = await CustomerService.list(req.apiKey!.actor, req.query as Record<string, unknown>);
  sendResponse(res, { message: "Customers", data, meta });
});

publicApiRoutes.get("/customers/:id", need("customers:read"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Customer", data: await CustomerService.getById(req.apiKey!.actor, await resolveCustomerId(String(req.params.id))) });
});

publicApiRoutes.post("/customers/:id/recharge", need("payments:write"), async (req: Request, res: Response) => {
  const body = rechargeSchema.parse({ ...req.body, customer: await resolveCustomerId(String(req.params.id)) });
  const data = await PaymentService.recharge(req.apiKey!.actor, { ...body, note: body.note ?? `API key ${req.apiKey!.id}` });
  sendResponse(res, { statusCode: 201, message: "Recharge successful", data });
});

publicApiRoutes.get("/payments", need("payments:read"), async (req: Request, res: Response) => {
  const { data, meta, totals } = await PaymentService.list(req.apiKey!.actor, req.query as Record<string, unknown>);
  res.json({ success: true, message: "Payments", meta, totals, data });
});

publicApiRoutes.get("/packages", need("customers:read"), async (_req: Request, res: Response) => {
  sendResponse(res, { message: "Packages", data: await Package.find({ isActive: true }).select("name speedDown speedUp price validityDays") });
});
