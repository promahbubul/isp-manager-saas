import { Request, Response, Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { countSegments } from "../../services/sms/segments";
import { runInBackground } from "../../utils/background";
import { paginate } from "../../utils/paginate";
import sendResponse from "../../utils/sendResponse";
import { objectId } from "../../utils/zod";
import { audit } from "../activityLog/activityLog.service";
import { Company } from "../company/company.model";
import { Customer, CUSTOMER_STATUSES } from "../customer/customer.model";
import { Actor, customerScope } from "../customer/customer.service";
import { ISmsLog, SMS_EVENTS, SMS_VARIABLES, SmsCreditTransaction, SmsLog, SmsTemplate } from "./sms.model";
import { assertBalance, customerVars, getTemplates, renderTemplate, sendSms } from "./sms.service";

const actor = (req: Request): Actor => ({
  id: req.user!.id,
  role: req.user!.role,
  company: req.user!.company,
  zones: req.user!.zones,
});

const updateTemplateSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  isActive: z.boolean().optional(),
});

const sendSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  /** numbers: free-typed phones · customers: picked ids · filter: everyone matching */
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("numbers"), numbers: z.array(z.string()).min(1).max(1000) }),
    z.object({ type: z.literal("customers"), ids: z.array(objectId).min(1).max(5000) }),
    z.object({
      type: z.literal("filter"),
      status: z.enum(CUSTOMER_STATUSES).optional(),
      zone: objectId.optional(),
      package: objectId.optional(),
    }),
  ]),
});

const MAX_BULK = 5000;

const router = Router();
router.use(auth(), requireWritableTenant);

router.get("/templates", authorize("sms.view"), async (req: Request, res: Response) => {
  const templates = await getTemplates(req.user!.company);
  sendResponse(res, { message: "SMS templates", data: { templates, variables: SMS_VARIABLES } });
});

router.put(
  "/templates/:event",
  authorize("sms.template"),
  validateBody(updateTemplateSchema),
  audit("sms.template_update", "sms_template"),
  async (req: Request, res: Response) => {
    const event = String(req.params.event);
    if (!(SMS_EVENTS as readonly string[]).includes(event)) throw new AppError(400, "Unknown template");
    await getTemplates(req.user!.company);
    const tpl = await SmsTemplate.findOneAndUpdate({ event: event as (typeof SMS_EVENTS)[number] }, { $set: req.body }, { returnDocument: "after" });
    sendResponse(res, { message: "Template saved", data: tpl });
  },
);

router.post(
  "/send",
  authorize("sms.send"),
  validateBody(sendSchema),
  audit("sms.send", "sms"),
  async (req: Request, res: Response) => {
    const { message, target } = req.body as z.infer<typeof sendSchema>;
    const a = actor(req);
    const companyDoc = await Company.findById(a.company).select("name");
    type Recipient = { to: string; customer?: string; text: string };
    let recipients: Recipient[];

    if (target.type === "numbers") {
      recipients = [...new Set(target.numbers.map((n) => n.trim()).filter(Boolean))].map((to) => ({
        to,
        text: renderTemplate(message, { company: companyDoc?.name }),
      }));
    } else {
      const filter: Record<string, unknown> = { ...customerScope(a), phone: { $exists: true, $ne: "" } };
      if (target.type === "customers") filter._id = { $in: target.ids };
      else {
        if (target.status) filter.status = target.status;
        if (target.package) filter.package = target.package;
        if (target.zone) {
          const allowed = (filter.zone as { $in: string[] } | undefined)?.$in;
          filter.zone = allowed && !allowed.includes(target.zone) ? { $in: [] } : target.zone;
        }
      }
      const customers = await Customer.find(filter).limit(MAX_BULK + 1);
      if (customers.length > MAX_BULK) throw new AppError(400, `Too many recipients (max ${MAX_BULK} per send)`);
      recipients = customers.map((c) => ({
        to: c.phone!,
        customer: c.id,
        text: renderTemplate(message, { company: companyDoc?.name, ...customerVars(c) }),
      }));
    }
    if (!recipients.length) throw new AppError(400, "No recipients matched");

    const credits = recipients.reduce((n, r) => n + countSegments(r.text).segments, 0);
    await assertBalance(a.company, credits);

    const event: ISmsLog["event"] = recipients.length > 1 ? "bulk" : "manual";
    runInBackground("sms:bulk", async () => {
      for (const r of recipients) {
        await sendSms(a.company, { to: r.to, message: r.text, event, customer: r.customer, sentBy: a.id });
      }
    });
    res.locals.auditSummary = `SMS to ${recipients.length} recipient(s), ${credits} credit(s)`;
    sendResponse(res, {
      statusCode: 202,
      message: `Sending to ${recipients.length} recipient(s)`,
      data: { recipients: recipients.length, credits },
    });
  },
);

router.get("/logs", authorize("sms.view"), async (req: Request, res: Response) => {
  const q = req.query as Record<string, unknown>;
  const filter: Record<string, unknown> = {};
  if (typeof q.customer === "string" && isValidObjectId(q.customer)) filter.customer = q.customer;
  const { data, meta } = await paginate<ISmsLog>(SmsLog, filter, q, {
    searchFields: ["to", "message"],
    filterFields: ["status", "event"],
    populate: [
      { path: "customer", select: "name customerId" },
      { path: "sentBy", select: "name" },
    ],
  });
  sendResponse(res, { message: "SMS logs", data, meta });
});

router.get("/balance", authorize("sms.view"), async (req: Request, res: Response) => {
  const [company, transactions] = await Promise.all([
    Company.findById(req.user!.company).select("smsBalance"),
    SmsCreditTransaction.find().sort("-createdAt").limit(20),
  ]);
  sendResponse(res, { message: "SMS balance", data: { balance: company?.smsBalance ?? 0, transactions } });
});

export default router;
