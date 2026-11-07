import { Request, Response, Router } from "express";
import { z } from "zod";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { optionalText } from "../../utils/zod";
import { audit } from "../activityLog/activityLog.service";
import { InvoiceService } from "./invoice.service";

/** /invoices — postpaid customer invoices. */
const router = Router();
router.use(auth(), requireWritableTenant);

router.get("/", authorize("invoice.view"), async (req: Request, res: Response) => {
  const { data, meta } = await InvoiceService.list(req.query as Record<string, unknown>);
  sendResponse(res, { message: "Invoices", data, meta });
});

/** Issue this month's invoices now (normally the worker does it on the 1st). */
router.post("/issue", authorize("invoice.manage"), audit("invoice.issue", "invoice"), async (req: Request, res: Response) => {
  const issued = await InvoiceService.issueMonthlyInvoices(req.user!.company);
  sendResponse(res, { statusCode: 201, message: issued ? `${issued} invoice(s) issued` : "All postpaid customers already have this month's invoice", data: { issued } });
});

router.post("/:id/void", authorize("invoice.manage"), validateBody(z.object({ note: optionalText(300) })), audit("invoice.void", "invoice"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Invoice voided", data: await InvoiceService.voidInvoice(String(req.params.id), req.body.note) });
});

export default router;
