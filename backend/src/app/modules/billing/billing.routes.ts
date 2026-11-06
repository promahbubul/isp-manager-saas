import { Request, Response, Router } from "express";
import { auth, authorize } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { audit } from "../activityLog/activityLog.service";
import { BillingService, couponCheckSchema, planCheckoutSchema, smsCheckoutSchema } from "./billing.service";

/**
 * ISP owner's subscription & SMS credit purchases.
 * Deliberately NOT behind requireWritableTenant — a suspended ISP must be able to pay.
 */
const router = Router();
router.use(auth(), authorize("subscription.manage"));

const actor = (req: Request) => ({ id: req.user!.id, company: req.user!.company });

router.get("/", async (req: Request, res: Response) => {
  sendResponse(res, { message: "Billing", data: await BillingService.overview(actor(req)) });
});

router.post("/checkout", validateBody(planCheckoutSchema), audit("billing.checkout", "billing"), async (req: Request, res: Response) => {
  const data = await BillingService.checkoutPlan(actor(req), req.body);
  const message = data.redirectUrl ? "Redirecting to payment" : "Submitted — your payment will be verified shortly";
  sendResponse(res, { statusCode: 201, message, data });
});

router.post("/coupon", validateBody(couponCheckSchema), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Coupon applied", data: await BillingService.checkCoupon(actor(req), req.body) });
});

router.post("/sms-credits", validateBody(smsCheckoutSchema), audit("billing.sms_credits", "billing"), async (req: Request, res: Response) => {
  const data = await BillingService.checkoutSmsCredits(actor(req), req.body);
  const message = data.redirectUrl ? "Redirecting to payment" : "Submitted — credits will be added after verification";
  sendResponse(res, { statusCode: 201, message, data });
});

export default router;
