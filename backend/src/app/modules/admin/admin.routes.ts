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
import platformRoutes from "./admin.platform.routes";
import { platformAudit } from "./platformAudit";

/**
 * Platform (super admin) API. Phase 4 adds tenant management, plans, etc.
 */
const router = Router();
router.use(platformAuth("super_admin", "finance"));
router.use(platformRoutes);

const creditSchema = z.object({
  /** positive = add, negative = deduct */
  credits: z.coerce.number().int().refine((n) => n !== 0, "Must not be zero"),
  type: z.enum(["purchase", "adjust", "bonus"]).default("adjust"),
  amount: z.coerce.number().min(0).optional(),
  note: optionalText(300),
});

router.post("/companies/:id/sms-credits", validateBody(creditSchema), platformAudit("tenant.sms_credits", "company", true), async (req: Request, res: Response) => {
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

router.post("/payments/:id/review", validateBody(reviewSchema), platformAudit("payment.review", "payment"), async (req: Request, res: Response) => {
  const data = await reviewManual(String(req.params.id), req.body.approve, req.platformUser!.id, req.body.reason);
  sendResponse(res, { message: req.body.approve ? "Payment approved" : "Payment rejected", data });
});

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
  })
  .partial();

router.get("/settings", async (_req: Request, res: Response) => {
  sendResponse(res, { message: "Platform settings", data: await getPlatformSettings() });
});

router.patch("/settings", platformAuth("super_admin"), validateBody(platformSettingSchema), platformAudit("platform.settings", "settings"), async (req: Request, res: Response) => {
  const s = await getPlatformSettings();
  s.set(req.body);
  await s.save();
  sendResponse(res, { message: "Settings saved", data: s });
});

export default router;
