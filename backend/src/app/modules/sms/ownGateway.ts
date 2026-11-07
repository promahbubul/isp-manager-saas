import { Request, Response, Router } from "express";
import { model, Schema, Types } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { tenantPlugin } from "../../plugins/tenant.plugin";
import { buildGateway, GATEWAY_FIELDS, GatewayConfig, gatewayBalance, SMS_GATEWAYS, SmsGatewayId } from "../../services/sms/gatewayProviders";
import { SmsProvider } from "../../services/sms/sms.provider";
import { decrypt, encrypt } from "../../utils/encryption";
import { normalizeBdPhone } from "../../utils/phone";
import sendResponse from "../../utils/sendResponse";
import { audit } from "../activityLog/activityLog.service";

/**
 * The ISP's own SMS gateway account (PutulHost, Twilio, Vonage, Plivo or any HTTP API).
 * The owner enters their credentials; when enabled, every SMS of this ISP (automatic,
 * bulk, OTP) goes through it and no platform SMS credits are used.
 */
export interface IOwnSmsGateway {
  company: Types.ObjectId;
  enabled: boolean;
  provider: SmsGatewayId;
  /** non-secret settings */
  options: Record<string, string>;
  /** AES-encrypted JSON of the secret fields */
  credentials?: string;
  lastTestAt?: Date;
  lastTestOk?: boolean;
  lastTestError?: string;
}

const schema = new Schema<IOwnSmsGateway>(
  {
    enabled: { type: Boolean, default: false },
    provider: { type: String, enum: SMS_GATEWAYS, required: true },
    options: { type: Schema.Types.Mixed, default: {} },
    credentials: { type: String, select: false },
    lastTestAt: Date,
    lastTestOk: Boolean,
    lastTestError: String,
  },
  { timestamps: true, minimize: false },
);
schema.plugin(tenantPlugin, { index: false });
schema.index({ company: 1 }, { unique: true });

export const OwnSmsGateway = model<IOwnSmsGateway>("OwnSmsGateway", schema);

function toConfig(gw: Pick<IOwnSmsGateway, "provider" | "options" | "credentials">): GatewayConfig {
  return { provider: gw.provider, options: gw.options ?? {}, credentials: gw.credentials ? JSON.parse(decrypt(gw.credentials)) : {} };
}

/** Provider to use for this company, or null for the platform gateway (paid by credits). */
export async function ownProviderFor(company: string | Types.ObjectId): Promise<SmsProvider | null> {
  const gw = await OwnSmsGateway.findOne({ company, enabled: true }).select("+credentials");
  return gw ? buildGateway(toConfig(gw)) : null;
}

const value = z.string().trim().max(1000);
const gatewaySchema = z
  .object({
    enabled: z.boolean(),
    provider: z.enum(SMS_GATEWAYS),
    /** every field of the chosen provider; secret ones may be omitted to keep the saved value */
    fields: z.record(z.string(), value).default({}),
  })
  .superRefine((d, ctx) => {
    const f = d.fields;
    if (d.provider === "http") {
      const url = f.httpUrl ?? "";
      if (url && (!/^https?:\/\//.test(url) || !url.includes("{to}") || !url.includes("{message}"))) {
        ctx.addIssue({ code: "custom", path: ["fields", "httpUrl"], message: "An http(s) URL containing {to} and {message}" });
      }
      try {
        new RegExp(f.successPattern || ".");
      } catch {
        ctx.addIssue({ code: "custom", path: ["fields", "successPattern"], message: "Not a valid regular expression" });
      }
    }
    if (d.provider === "putulhost" && f.transactionType && !["T", "P"].includes(f.transactionType)) {
      ctx.addIssue({ code: "custom", path: ["fields", "transactionType"], message: "T (transactional) or P (promotional)" });
    }
  });

export const ownGatewayRoutes = Router();
ownGatewayRoutes.use(auth(), requireWritableTenant, authorize("setting.manage"));

/** Which fields each provider needs (for the settings form). */
ownGatewayRoutes.get("/providers", (_req: Request, res: Response) => {
  sendResponse(res, { message: "SMS providers", data: GATEWAY_FIELDS });
});

ownGatewayRoutes.get("/", async (_req: Request, res: Response) => {
  const gw = await OwnSmsGateway.findOne().select("+credentials");
  if (!gw) return sendResponse(res, { message: "SMS gateway", data: null });
  const saved = Object.keys(toConfig(gw).credentials);
  sendResponse(res, { message: "SMS gateway", data: { ...gw.toJSON(), credentials: undefined, savedSecrets: saved } });
});

ownGatewayRoutes.put("/", validateBody(gatewaySchema), audit("sms.own_gateway", "setting"), async (req: Request, res: Response) => {
  const { enabled, provider, fields } = req.body as z.infer<typeof gatewaySchema>;
  const spec = GATEWAY_FIELDS[provider];
  const existing = await OwnSmsGateway.findOne().select("+credentials");
  // keep saved secrets when the form leaves them blank (and only if the provider did not change)
  const oldSecrets = existing && existing.provider === provider ? toConfig(existing).credentials : {};
  const credentials: Record<string, string> = {};
  for (const k of spec.credentials) {
    const v = fields[k]?.trim();
    if (v) credentials[k] = v;
    else if (oldSecrets[k]) credentials[k] = oldSecrets[k];
  }
  const options = Object.fromEntries(spec.options.filter((k) => fields[k]?.trim()).map((k) => [k, fields[k].trim()]));
  if (provider === "putulhost" && !options.transactionType) options.transactionType = "T";
  const missing = spec.required.filter((k) => !(credentials[k] ?? options[k]));
  if (enabled && missing.length) throw new AppError(400, `Fill in: ${missing.join(", ")}`);

  const gw = await OwnSmsGateway.findOneAndUpdate(
    {},
    { $set: { enabled, provider, options, credentials: encrypt(JSON.stringify(credentials)) }, $setOnInsert: { company: req.user!.company } },
    { upsert: true, returnDocument: "after" },
  );
  sendResponse(res, { message: enabled ? "Your SMS gateway is on — no platform SMS credits will be used" : "Saved (turned off)", data: { ...gw!.toJSON(), credentials: undefined } });
});

/** Send one test SMS through the saved gateway (even if not enabled yet). */
ownGatewayRoutes.post("/test", validateBody(z.object({ to: z.string() })), async (req: Request, res: Response) => {
  const to = normalizeBdPhone(req.body.to);
  if (!to) throw new AppError(400, "Enter a valid mobile number");
  const gw = await OwnSmsGateway.findOne().select("+credentials");
  if (!gw) throw new AppError(400, "Save the gateway first");
  const r = await buildGateway(toConfig(gw)).send(to, "Test SMS from ISP Manager: your SMS gateway works.");
  gw.set({ lastTestAt: new Date(), lastTestOk: r.ok, lastTestError: r.ok ? undefined : r.error });
  await gw.save();
  sendResponse(res, { message: r.ok ? "Test SMS sent" : `Failed: ${r.error}`, data: { ok: r.ok, response: r.response?.slice(0, 300) } });
});

ownGatewayRoutes.get("/balance", async (_req: Request, res: Response) => {
  const gw = await OwnSmsGateway.findOne().select("+credentials");
  if (!gw) throw new AppError(400, "Save the gateway first");
  sendResponse(res, { message: "Gateway balance", data: { balance: await gatewayBalance(toConfig(gw)) } });
});
