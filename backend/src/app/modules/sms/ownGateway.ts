import { Request, Response, Router } from "express";
import { model, Schema, Types } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { tenantPlugin } from "../../plugins/tenant.plugin";
import { createHttpProvider, SmsProvider } from "../../services/sms/sms.provider";
import { decrypt, encrypt } from "../../utils/encryption";
import { normalizeBdPhone } from "../../utils/phone";
import sendResponse from "../../utils/sendResponse";
import { optionalText } from "../../utils/zod";
import { audit } from "../activityLog/activityLog.service";
import { hasFeature, requireFeature } from "../subscription/planFeature";

/**
 * The ISP's own SMS gateway account (plan feature own_sms_gateway).
 * When enabled, their SMS go through it and no platform SMS credits are used.
 */
export interface IOwnSmsGateway {
  company: Types.ObjectId;
  enabled: boolean;
  /** URL template, placeholders {to} {message} {apiKey} {senderId} */
  httpUrl: string;
  httpMethod: "GET" | "POST";
  successPattern: string;
  /** encrypted */
  apiKey?: string;
  senderId?: string;
  lastTestAt?: Date;
  lastTestOk?: boolean;
}

const schema = new Schema<IOwnSmsGateway>(
  {
    enabled: { type: Boolean, default: false },
    httpUrl: { type: String, required: true, maxlength: 1000 },
    httpMethod: { type: String, enum: ["GET", "POST"], default: "GET" },
    successPattern: { type: String, default: ".", maxlength: 200 },
    apiKey: { type: String, select: false },
    senderId: { type: String, maxlength: 30 },
    lastTestAt: Date,
    lastTestOk: Boolean,
  },
  { timestamps: true },
);
schema.plugin(tenantPlugin, { index: false });
schema.index({ company: 1 }, { unique: true });

export const OwnSmsGateway = model<IOwnSmsGateway>("OwnSmsGateway", schema);

/** Provider to use for this company, or null for the platform gateway (paid by credits). */
export async function ownProviderFor(company: string | Types.ObjectId): Promise<SmsProvider | null> {
  const gw = await OwnSmsGateway.findOne({ company, enabled: true }).select("+apiKey");
  if (!gw) return null;
  if (!(await hasFeature(company, "own_sms_gateway"))) return null; // downgraded: fall back to credits
  return createHttpProvider({ httpUrl: gw.httpUrl, httpMethod: gw.httpMethod, successPattern: gw.successPattern, apiKey: gw.apiKey ? decrypt(gw.apiKey) : "", senderId: gw.senderId });
}

const gatewaySchema = z.object({
  enabled: z.boolean(),
  httpUrl: z
    .url()
    .max(1000)
    .refine((u) => u.startsWith("https://") || u.startsWith("http://"), "Must be an http(s) URL")
    .refine((u) => u.includes("{to}") && u.includes("{message}"), "The URL must contain {to} and {message}"),
  httpMethod: z.enum(["GET", "POST"]).default("GET"),
  successPattern: z
    .string()
    .max(200)
    .default(".")
    .refine((p) => {
      try {
        new RegExp(p);
        return true;
      } catch {
        return false;
      }
    }, "Not a valid regular expression"),
  /** omit to keep the saved key */
  apiKey: optionalText(300),
  senderId: optionalText(30),
});

export const ownGatewayRoutes = Router();
ownGatewayRoutes.use(auth(), requireWritableTenant, authorize("setting.manage"), requireFeature("own_sms_gateway"));

ownGatewayRoutes.get("/", async (_req: Request, res: Response) => {
  const gw = await OwnSmsGateway.findOne().select("+apiKey");
  sendResponse(res, { message: "Own SMS gateway", data: gw ? { ...gw.toJSON(), apiKey: undefined, hasApiKey: Boolean(gw.apiKey) } : null });
});

ownGatewayRoutes.put("/", validateBody(gatewaySchema), audit("sms.own_gateway", "setting"), async (req: Request, res: Response) => {
  const { apiKey, ...rest } = req.body as z.infer<typeof gatewaySchema>;
  const set: Record<string, unknown> = { ...rest };
  if (apiKey) set.apiKey = encrypt(apiKey);
  const gw = await OwnSmsGateway.findOneAndUpdate({}, { $set: set, $setOnInsert: { company: req.user!.company } }, { upsert: true, returnDocument: "after" });
  sendResponse(res, { message: rest.enabled ? "Your SMS gateway is on — no SMS credits will be used" : "Saved (turned off)", data: gw });
});

/** Send one test SMS through the saved gateway (even if not enabled yet). */
ownGatewayRoutes.post("/test", validateBody(z.object({ to: z.string() })), async (req: Request, res: Response) => {
  const to = normalizeBdPhone(req.body.to);
  if (!to) throw new AppError(400, "Enter a valid mobile number");
  const gw = await OwnSmsGateway.findOne().select("+apiKey");
  if (!gw) throw new AppError(400, "Save the gateway first");
  const provider = createHttpProvider({ httpUrl: gw.httpUrl, httpMethod: gw.httpMethod, successPattern: gw.successPattern, apiKey: gw.apiKey ? decrypt(gw.apiKey) : "", senderId: gw.senderId });
  const r = await provider.send(to, "Test SMS from ISP Manager: your own gateway works.");
  gw.lastTestAt = new Date();
  gw.lastTestOk = r.ok;
  await gw.save();
  sendResponse(res, { message: r.ok ? "Test SMS sent" : `Failed: ${r.error}`, data: { ok: r.ok, response: r.response?.slice(0, 300) } });
});
