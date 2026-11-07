import { Request, Response, Router } from "express";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { audit } from "../activityLog/activityLog.service";
import { requireFeature } from "../subscription/planFeature";
import { adjustSchema, createResellerSchema, depositSchema, ResellerService, updateResellerSchema } from "./reseller.service";

const router = Router();
router.use(auth(), requireFeature("reseller"), requireWritableTenant);
const id = (req: Request) => String(req.params.id);

/** The reseller's own balance and recent transactions (reseller login). */
router.get("/me", async (req: Request, res: Response) => {
  sendResponse(res, { message: "My reseller account", data: await ResellerService.mine(req.user!.reseller) });
});

router.get("/", authorize("reseller.view"), async (req: Request, res: Response) => {
  const { data, meta } = await ResellerService.list(req.query as Record<string, unknown>);
  sendResponse(res, { message: "Resellers", data, meta });
});

router.post("/", authorize("reseller.manage"), validateBody(createResellerSchema), audit("reseller.create", "reseller"), async (req: Request, res: Response) => {
  sendResponse(res, { statusCode: 201, message: "Reseller created. They can log in with their mobile number.", data: await ResellerService.create(req.user!.company, req.body) });
});

router.get("/:id", authorize("reseller.view"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Reseller", data: await ResellerService.get(id(req)) });
});

router.patch("/:id", authorize("reseller.manage"), validateBody(updateResellerSchema), audit("reseller.update", "reseller"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Reseller updated", data: await ResellerService.update(req.user!.company, id(req), req.body) });
});

router.post("/:id/deposit", authorize("reseller.deposit"), validateBody(depositSchema), audit("reseller.deposit", "reseller"), async (req: Request, res: Response) => {
  const r = await ResellerService.deposit(req.user!.company, req.user!.id, id(req), req.body);
  sendResponse(res, { statusCode: 201, message: `Balance is now ৳${r.reseller.balance}`, data: r });
});

router.post("/:id/adjust", authorize("reseller.manage"), validateBody(adjustSchema), audit("reseller.adjust", "reseller"), async (req: Request, res: Response) => {
  const r = await ResellerService.adjust(req.user!.id, id(req), req.body);
  sendResponse(res, { statusCode: 201, message: `Balance is now ৳${r.reseller.balance}`, data: r });
});

router.get("/:id/ledger", authorize("reseller.view"), async (req: Request, res: Response) => {
  const { data, meta } = await ResellerService.ledger(id(req), req.query as Record<string, unknown>);
  sendResponse(res, { message: "Reseller ledger", data, meta });
});

export default router;
