import { Request, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import config from "../../config";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { optionalText } from "../../utils/zod";
import { audit } from "../activityLog/activityLog.service";
import { listGatewaySettings, updateGatewaySchema, updateGatewaySettings } from "../paymentGateway/gatewayConfig.service";
import { CustomerBillService, lookupSchema, payBillSchema } from "./customerBill.service";

/* ───────────── public bill payment: /public/pay/:slug ───────────── */

export const publicPayRoutes = Router();

// Lookups need ID + phone; still rate-limit to stop guessing.
const payLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { success: false, message: "Too many attempts. Please try again later." },
});

publicPayRoutes.get("/:slug", async (req: Request, res: Response) => {
  sendResponse(res, { message: "Payment page", data: await CustomerBillService.publicInfo(String(req.params.slug)) });
});

publicPayRoutes.post("/:slug/lookup", payLimiter, validateBody(lookupSchema), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Bill", data: await CustomerBillService.lookup(String(req.params.slug), req.body) });
});

publicPayRoutes.post("/:slug/checkout", payLimiter, validateBody(payBillSchema), async (req: Request, res: Response) => {
  const data = await CustomerBillService.payBill(String(req.params.slug), req.body);
  const message = data.status === "pending_review" ? "Submitted. The ISP will confirm your payment shortly." : "Redirecting to payment";
  sendResponse(res, { statusCode: 201, message, data });
});

publicPayRoutes.get("/:slug/status/:tranId", async (req: Request, res: Response) => {
  sendResponse(res, { message: "Payment status", data: await CustomerBillService.paymentStatus(String(req.params.slug), String(req.params.tranId)) });
});

/* ───────────── ISP staff: /online-payments ───────────── */

export const tenantOnlinePaymentRoutes = Router();
tenantOnlinePaymentRoutes.use(auth(), requireWritableTenant);

tenantOnlinePaymentRoutes.get("/", authorize("payment.view"), async (req: Request, res: Response) => {
  const { data, meta } = await CustomerBillService.listForTenant(req.user!.company, req.query as Record<string, unknown>);
  sendResponse(res, { message: "Online payments", data, meta });
});

const rejectSchema = z.object({ reason: optionalText(300) });

tenantOnlinePaymentRoutes.post("/:id/approve", authorize("payment.recharge"), audit("payment.online_approve", "payment"), async (req: Request, res: Response) => {
  const data = await CustomerBillService.review(req.user!.company, String(req.params.id), true, req.user!.id);
  sendResponse(res, { message: "Payment approved and recharge applied", data });
});

tenantOnlinePaymentRoutes.post(
  "/:id/reject",
  authorize("payment.recharge"),
  validateBody(rejectSchema),
  audit("payment.online_reject", "payment"),
  async (req: Request, res: Response) => {
    const data = await CustomerBillService.review(req.user!.company, String(req.params.id), false, req.user!.id, req.body.reason);
    sendResponse(res, { message: "Payment rejected", data });
  },
);

/* ───────────── ISP gateway settings: /settings/payment-gateways ───────────── */

export const tenantGatewayRoutes = Router();
tenantGatewayRoutes.use(auth(), requireWritableTenant, authorize("setting.manage"));

tenantGatewayRoutes.get("/", async (req: Request, res: Response) => {
  const gateways = await listGatewaySettings(req.user!.company);
  sendResponse(res, { message: "Payment gateways", data: { gateways, webhookBase: `${config.apiPublicUrl}/api/v1/pg/stripe/webhook/${req.user!.company}` } });
});

tenantGatewayRoutes.put("/:gateway", validateBody(updateGatewaySchema), audit("setting.payment_gateway", "setting"), async (req: Request, res: Response) => {
  const data = await updateGatewaySettings(req.user!.company, String(req.params.gateway), req.body);
  sendResponse(res, { message: "Payment gateway saved", data });
});
