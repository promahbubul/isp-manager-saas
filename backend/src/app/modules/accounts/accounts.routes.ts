import { Request, Response, Router } from "express";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { audit } from "../activityLog/activityLog.service";
import { AccountsService, entrySchema, entryUpdateSchema } from "./accounts.service";

/** /accounts — expenses, other income and profit & loss. */
const router = Router();
router.use(auth(), requireWritableTenant);
const id = (req: Request) => String(req.params.id);

router.get("/entries", authorize("expense.view"), async (req: Request, res: Response) => {
  const { data, meta, totals } = await AccountsService.list(req.query as Record<string, unknown>);
  sendResponse(res, { message: "Entries", data: { entries: data, totals }, meta });
});

router.get("/categories", authorize("expense.view"), async (_req: Request, res: Response) => {
  sendResponse(res, { message: "Categories", data: await AccountsService.categories() });
});

router.post("/entries", authorize("expense.manage"), validateBody(entrySchema), audit("accounts.entry_create", "ledger"), async (req: Request, res: Response) => {
  const e = await AccountsService.create(req.user!.id, req.body);
  sendResponse(res, { statusCode: 201, message: `${e.type === "expense" ? "Expense" : "Income"} saved`, data: e });
});

router.patch("/entries/:id", authorize("expense.manage"), validateBody(entryUpdateSchema), audit("accounts.entry_update", "ledger"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Entry updated", data: await AccountsService.update(id(req), req.body) });
});

router.delete("/entries/:id", authorize("expense.manage"), audit("accounts.entry_delete", "ledger"), async (req: Request, res: Response) => {
  await AccountsService.remove(id(req));
  sendResponse(res, { message: "Entry deleted" });
});

router.get("/pnl", authorize("expense.view"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Profit & loss", data: await AccountsService.profitAndLoss(req.user!.company, req.query as Record<string, unknown>) });
});

export default router;
