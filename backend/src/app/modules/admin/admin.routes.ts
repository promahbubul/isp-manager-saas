import { Request, Response, Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { platformAuth } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { optionalText } from "../../utils/zod";
import { Company } from "../company/company.model";
import { Coupon } from "../coupon/coupon.model";
import { couponSchema, couponUpdateSchema } from "../coupon/coupon.service";
import { SmsCreditTransaction } from "../sms/sms.model";
import config from "../../config";
import { paginate } from "../../utils/paginate";
import { getPlatformSettings } from "../billing/billing.model";
import { reviewManual } from "../onlinePayment/onlinePayment.service";
import { IPaymentAttempt, PaymentAttempt } from "../onlinePayment/paymentAttempt.model";
import { listGatewaySettings, updateGatewaySchema, updateGatewaySettings } from "../paymentGateway/gatewayConfig.service";
import { platformSupportRoutes } from "../support/support.routes";
import { SystemService } from "../system/system.service";
import platformRoutes from "./admin.platform.routes";
import { adminContentRoutes } from "../content/content";
import { ErrorLog } from "../system/errorLog.model";
import { emailLayout, sendEmail } from "../../services/email/email.service";
import { encrypt } from "../../utils/encryption";
import { PlatformSetting, SubscriptionInvoice } from "../billing/billing.model";
import { platformAudit } from "./platformAudit";

/**
 * Platform (super admin) API. Phase 4 adds tenant management, plans, etc.
 */
const router = Router();
// Every platform role can read; writes are limited per route (finance = money, super_admin = everything).
router.use(platformAuth());
const financeOrSuper = platformAuth("super_admin", "finance");
router.use(platformRoutes);
router.use("/support-tickets", platformSupportRoutes);

router.get("/system/health", async (_req: Request, res: Response) => {
  sendResponse(res, { message: "System health", data: await SystemService.health() });
});

const creditSchema = z.object({
  /** positive = add, negative = deduct */
  credits: z.coerce.number().int().refine((n) => n !== 0, "Must not be zero"),
  type: z.enum(["purchase", "adjust", "bonus"]).default("adjust"),
  amount: z.coerce.number().min(0).optional(),
  note: optionalText(300),
});

router.post("/companies/:id/sms-credits", financeOrSuper, validateBody(creditSchema), platformAudit("tenant.sms_credits", "company", true), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid company id");
  const { credits, type, amount, note } = req.body as z.infer<typeof creditSchema>;

  const filter = credits < 0 ? { _id: id, smsBalance: { $gte: -credits } } : { _id: id };
  const company = await Company.findOneAndUpdate(filter, { $inc: { smsBalance: credits } }, { returnDocument: "after" });
  if (!company) throw new AppError(credits < 0 ? 400 : 404, credits < 0 ? "Balance would go negative" : "Company not found");

  await SmsCreditTransaction.create({
    company: company._id,
    type,
    credits,
    amount,
    note,
    balanceAfter: company.smsBalance,
    by: req.platformUser!.id,
  });
  sendResponse(res, { message: `SMS balance is now ${company.smsBalance}`, data: { balance: company.smsBalance } });
});

/* ── Platform payment gateways (what ISPs can pay the platform with) ── */

router.get("/gateways", async (_req: Request, res: Response) => {
  const gateways = await listGatewaySettings(null);
  sendResponse(res, { message: "Platform payment gateways", data: { gateways, webhookBase: `${config.apiPublicUrl}/api/v1/pg/stripe/webhook/platform` } });
});

router.put("/gateways/:gateway", platformAuth("super_admin"), validateBody(updateGatewaySchema), platformAudit("gateway.update", "gateway"), async (req: Request, res: Response) => {
  const data = await updateGatewaySettings(null, String(req.params.gateway), req.body);
  sendResponse(res, { message: "Payment gateway saved", data });
});

/* ── Platform payments (subscriptions, SMS credits) incl. manual review ── */

router.get("/payments", async (req: Request, res: Response) => {
  const { data, meta } = await paginate<IPaymentAttempt>(PaymentAttempt, { scope: { $ne: "customer_bill" } }, req.query as Record<string, unknown>, {
    searchFields: ["tranId", "gatewayTrxId", "description"],
    filterFields: ["status", "gateway", "scope"],
    populate: [{ path: "company", select: "name slug" }],
  });
  sendResponse(res, { message: "Platform payments", data, meta });
});

const reviewSchema = z.object({ approve: z.boolean(), reason: optionalText(300) });

router.post("/payments/:id/review", financeOrSuper, validateBody(reviewSchema), platformAudit("payment.review", "payment"), async (req: Request, res: Response) => {
  const data = await reviewManual(String(req.params.id), req.body.approve, req.platformUser!.id, req.body.reason);
  sendResponse(res, { message: req.body.approve ? "Payment approved" : "Payment rejected", data });
});

/** Record a refund for a platform payment. The money itself is returned from the gateway dashboard / bKash. */
router.post("/payments/:id/refund", platformAuth("super_admin"), validateBody(z.object({ reason: z.string().trim().min(3).max(300) })), platformAudit("payment.refund", "payment"), async (req: Request, res: Response) => {
  const a = await PaymentAttempt.findOne({ _id: String(req.params.id), scope: { $ne: "customer_bill" } });
  if (!a) throw new AppError(404, "Payment not found");
  if (a.status !== "success") throw new AppError(400, "Only successful payments can be refunded");
  a.set({ status: "refunded", refundedAt: new Date(), refundReason: req.body.reason, refundedBy: req.platformUser!.id });
  await a.save();
  let effect = "";
  if (a.scope === "sms_credit" && a.company) {
    const credits = Number(a.refs?.smsCredits ?? 0);
    if (credits > 0) {
      const c = await Company.findById(a.company).select("smsBalance");
      const take = Math.min(credits, c?.smsBalance ?? 0);
      await Company.updateOne({ _id: a.company }, { $inc: { smsBalance: -take } });
      await SmsCreditTransaction.create({ company: a.company, type: "adjust", credits: -take, note: `Refund: ${req.body.reason}`, balanceAfter: (c?.smsBalance ?? 0) - take, by: req.platformUser!.id });
      effect = ` ${take} SMS credits removed.`;
    }
  }
  if (a.scope === "subscription") {
    await SubscriptionInvoice.updateMany({ $or: [{ attempt: a._id }, ...(a.refs?.invoice ? [{ _id: a.refs.invoice }] : [])] }, { status: "void" });
    effect = " Invoice voided — change the plan/period from the ISP page if needed.";
  }
  sendResponse(res, { message: `Refund recorded.${effect} Return the money from the gateway dashboard.`, data: a });
});

/* ── Error log (5xx) ── */
router.get("/error-logs", async (req: Request, res: Response) => {
  const { data, meta } = await paginate(ErrorLog, {}, req.query as Record<string, unknown>, { searchFields: ["message", "path"], defaultSort: "-lastAt", select: "-stack", populate: [{ path: "company", select: "name slug" }] });
  sendResponse(res, { message: "Error log", data, meta });
});

router.get("/error-logs/:id", async (req: Request, res: Response) => {
  const e = await ErrorLog.findById(String(req.params.id)).populate("company", "name slug");
  if (!e) throw new AppError(404, "Not found");
  sendResponse(res, { message: "Error", data: e });
});

router.delete("/error-logs/:id", platformAuth("super_admin"), async (req: Request, res: Response) => {
  await ErrorLog.deleteOne({ _id: String(req.params.id) });
  sendResponse(res, { message: "Marked as fixed" });
});

router.use("/content", adminContentRoutes);

/* ── Coupons ── */

router.get("/coupons", async (_req: Request, res: Response) => {
  sendResponse(res, { message: "Coupons", data: await Coupon.find().sort("-createdAt").populate("plans", "name") });
});

router.post("/coupons", platformAuth("super_admin"), validateBody(couponSchema), platformAudit("coupon.create", "coupon"), async (req: Request, res: Response) => {
  sendResponse(res, { statusCode: 201, message: "Coupon created", data: await Coupon.create(req.body) });
});

router.patch("/coupons/:id", platformAuth("super_admin"), validateBody(couponUpdateSchema), async (req: Request, res: Response) => {
  const coupon = await Coupon.findById(String(req.params.id));
  if (!coupon) throw new AppError(404, "Coupon not found");
  const { validTo, ...rest } = req.body as z.infer<typeof couponUpdateSchema>;
  coupon.set(rest);
  if (validTo !== undefined) coupon.set("validTo", validTo ?? undefined);
  await coupon.save();
  sendResponse(res, { message: "Coupon updated", data: coupon });
});

/* ── Platform settings ── */

const platformSettingSchema = z
  .object({
    smsCreditPriceBDT: z.coerce.number().min(0).max(10),
    smsCreditPriceUSD: z.coerce.number().min(0).max(1),
    graceDays: z.coerce.number().int().min(0).max(60),
    smtp: z
      .object({
        enabled: z.boolean(),
        host: optionalText(200),
        port: z.coerce.number().int().min(1).max(65535).optional(),
        user: optionalText(200),
        /** omit to keep the saved password */
        pass: optionalText(300),
        from: optionalText(200),
      })
      .partial(),
  })
  .partial();

router.get("/settings", async (_req: Request, res: Response) => {
  const s = await getPlatformSettings();
  const withPass = await PlatformSetting.findById("global").select("+smtp.pass");
  sendResponse(res, { message: "Platform settings", data: { ...s.toJSON(), smtpHasPassword: Boolean(withPass?.smtp?.pass) } });
});

router.post("/settings/test-email", platformAuth("super_admin"), validateBody(z.object({ to: z.email() })), async (req: Request, res: Response) => {
  const r = await sendEmail({ to: req.body.to, subject: "ISP Manager test email", html: emailLayout("SMTP works", [["Sent at", new Date().toISOString()]]) });
  if (!r.ok) throw new AppError(400, `Email failed: ${r.error}`);
  sendResponse(res, { message: `Test email sent to ${req.body.to}` });
});

router.patch("/settings", platformAuth("super_admin"), validateBody(platformSettingSchema), platformAudit("platform.settings", "settings"), async (req: Request, res: Response) => {
  await getPlatformSettings(); // creates the document on first use
  const s = await PlatformSetting.findById("global").select("+smtp.pass").orFail();
  const { smtp, ...rest } = req.body as z.infer<typeof platformSettingSchema>;
  s.set(rest);
  if (smtp) {
    const { pass, ...smtpRest } = smtp;
    s.set("smtp", { ...(s.toObject().smtp ?? {}), ...smtpRest, ...(pass ? { pass: encrypt(pass) } : {}) });
  }
  await s.save();
  sendResponse(res, { message: "Settings saved", data: s });
});

export default router;
