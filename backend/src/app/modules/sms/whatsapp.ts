import { Request, Response, Router } from "express";
import { model, Schema, Types } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { tenantPlugin } from "../../plugins/tenant.plugin";
import { toInternational } from "../../services/sms/sms.provider";
import { decrypt, encrypt } from "../../utils/encryption";
import { normalizeBdPhone } from "../../utils/phone";
import sendResponse from "../../utils/sendResponse";
import { optionalText } from "../../utils/zod";
import { audit } from "../activityLog/activityLog.service";
import { hasFeature, requireFeature } from "../subscription/planFeature";
import { SMS_EVENTS, SMS_VARIABLES, SmsEvent } from "./sms.model";

/**
 * WhatsApp notifications via the official WhatsApp Cloud API (Meta). Business-initiated
 * messages must use templates approved in WhatsApp Manager; each event maps to one
 * template whose body variables {{1}}, {{2}}... are filled in `params` order.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

type EventTemplate = { template: string; language: string; params: string[] };

export interface IWhatsAppConfig {
  company: Types.ObjectId;
  enabled: boolean;
  phoneNumberId: string;
  /** encrypted permanent access token (System User) */
  accessToken?: string;
  events: Partial<Record<SmsEvent, EventTemplate>>;
}

const schema = new Schema<IWhatsAppConfig>(
  {
    enabled: { type: Boolean, default: false },
    phoneNumberId: { type: String, required: true },
    accessToken: { type: String, select: false },
    events: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false },
);
schema.plugin(tenantPlugin, { index: false });
schema.index({ company: 1 }, { unique: true });
export const WhatsAppConfig = model<IWhatsAppConfig>("WhatsAppConfig", schema);

export async function sendWhatsAppTemplate(cfg: { phoneNumberId: string; accessToken: string }, to: string, tpl: EventTemplate, vars: Record<string, string | number | undefined>) {
  const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toInternational(to),
      type: "template",
      template: {
        name: tpl.template,
        language: { code: tpl.language },
        components: tpl.params.length ? [{ type: "body", parameters: tpl.params.map((p) => ({ type: "text", text: String(vars[p] ?? "-") })) }] : [],
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.text();
  return { ok: res.ok, response: body.slice(0, 500) };
}

/** Called next to the event SMS. Never throws. */
export async function sendEventWhatsApp(company: string | Types.ObjectId, event: SmsEvent, phone: string, vars: Record<string, string | number | undefined>) {
  try {
    const cfg = await WhatsAppConfig.findOne({ company, enabled: true }).select("+accessToken");
    const tpl = cfg?.events?.[event];
    if (!cfg?.accessToken || !tpl?.template) return;
    if (!(await hasFeature(company, "whatsapp"))) return;
    const r = await sendWhatsAppTemplate({ phoneNumberId: cfg.phoneNumberId, accessToken: decrypt(cfg.accessToken) }, phone, tpl, vars);
    if (!r.ok) console.error(`[whatsapp] ${event} failed:`, r.response);
  } catch (err) {
    console.error("[whatsapp]", (err as Error).message);
  }
}

const templateSchema = z.object({
  template: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, "Template names are lowercase letters, digits and _"),
  language: z.string().trim().min(2).max(10).default("bn"),
  params: z.array(z.string()).max(10).default([]),
});
const configSchema = z
  .object({
    enabled: z.boolean(),
    phoneNumberId: z.string().trim().regex(/^\d{6,30}$/, "Phone number ID is the long number shown in WhatsApp Manager"),
    accessToken: optionalText(1000),
    events: z.partialRecord(z.enum(SMS_EVENTS), templateSchema).default({}),
  })
  .superRefine((d, ctx) => {
    for (const [ev, t] of Object.entries(d.events)) {
      const allowed = SMS_VARIABLES[ev as SmsEvent];
      for (const p of t?.params ?? []) if (!allowed.includes(p)) ctx.addIssue({ code: "custom", path: ["events", ev, "params"], message: `${p} is not available for ${ev} (use: ${allowed.join(", ")})` });
    }
  });

export const whatsappRoutes = Router();
whatsappRoutes.use(auth(), requireWritableTenant, authorize("setting.manage"), requireFeature("whatsapp"));

whatsappRoutes.get("/", async (_req: Request, res: Response) => {
  const cfg = await WhatsAppConfig.findOne().select("+accessToken");
  sendResponse(res, { message: "WhatsApp", data: cfg ? { ...cfg.toJSON(), accessToken: undefined, hasAccessToken: Boolean(cfg.accessToken) } : null, meta: undefined });
});

whatsappRoutes.put("/", validateBody(configSchema), audit("whatsapp.config", "setting"), async (req: Request, res: Response) => {
  const { accessToken, ...rest } = req.body as z.infer<typeof configSchema>;
  const set: Record<string, unknown> = { ...rest };
  if (accessToken) set.accessToken = encrypt(accessToken);
  const existing = await WhatsAppConfig.findOne().select("+accessToken");
  if (rest.enabled && !accessToken && !existing?.accessToken) throw new AppError(400, "Enter the access token");
  const cfg = await WhatsAppConfig.findOneAndUpdate({}, { $set: set, $setOnInsert: { company: req.user!.company } }, { upsert: true, returnDocument: "after" });
  sendResponse(res, { message: "WhatsApp settings saved", data: cfg });
});

whatsappRoutes.post("/test", validateBody(z.object({ to: z.string(), event: z.enum(SMS_EVENTS) })), async (req: Request, res: Response) => {
  const to = normalizeBdPhone(req.body.to);
  if (!to) throw new AppError(400, "Enter a valid mobile number");
  const cfg = await WhatsAppConfig.findOne().select("+accessToken");
  const tpl = cfg?.events?.[req.body.event as SmsEvent];
  if (!cfg?.accessToken || !tpl) throw new AppError(400, "Save the token and a template for this event first");
  const sample = { name: "Test Customer", customerId: "C-00001", amount: 500, expiry: "01/12/2026", due: 0, company: "ISP", receiptNo: "R-00001", ticketNo: "T-00001", status: "Solved", package: "10 Mbps", username: "test", password: "****", pay_link: "", portal_link: "" };
  const r = await sendWhatsAppTemplate({ phoneNumberId: cfg.phoneNumberId, accessToken: decrypt(cfg.accessToken) }, to, tpl, sample);
  sendResponse(res, { message: r.ok ? "Test message sent" : "WhatsApp rejected the message", data: r });
});
