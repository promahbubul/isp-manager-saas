import { Request, Response, Router } from "express";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { Actor } from "../customer/customer.service";
import { audit } from "../activityLog/activityLog.service";
import { PaymentService } from "./payment.service";
import { rechargeSchema } from "./payment.validation";

const actor = (req: Request): Actor => ({
  id: req.user!.id,
  role: req.user!.role,
  company: req.user!.company,
  zones: req.user!.zones,
  reseller: req.user!.reseller,
});

const PaymentController = {
  recharge: async (req: Request, res: Response) => {
    const data = await PaymentService.recharge(actor(req), req.body);
    const msg = data.sync && !data.sync.ok ? `Recharged, but router sync failed: ${data.sync.error}` : "Recharge successful";
    sendResponse(res, { statusCode: 201, message: msg, data });
  },
  list: async (req: Request, res: Response) => {
    const { data, meta, totals } = await PaymentService.list(actor(req), req.query as Record<string, unknown>);
    res.json({ success: true, message: "Payments", meta, totals, data });
  },
  receipt: async (req: Request, res: Response) => {
    sendResponse(res, { message: "Receipt", data: await PaymentService.receipt(actor(req), String(req.params.id)) });
  },
};

const router = Router();
router.use(auth(), requireWritableTenant);

router.post("/recharge", authorize("payment.recharge"), validateBody(rechargeSchema), audit("payment.recharge", "payment"), PaymentController.recharge);
router.get("/", authorize("payment.view"), PaymentController.list);
router.get("/:id", authorize("payment.view"), PaymentController.receipt);

export default router;
