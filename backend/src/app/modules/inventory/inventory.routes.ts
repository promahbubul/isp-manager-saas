import { Request, Response, Router } from "express";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { audit } from "../activityLog/activityLog.service";
import { requireFeature } from "../subscription/planFeature";
import { InventoryService, itemSchema, itemUpdateSchema, movementSchema } from "./inventory.service";

/** /inventory — routers, ONUs, cable, connectors. */
const router = Router();
router.use(auth(), requireFeature("inventory"), requireWritableTenant);
const id = (req: Request) => String(req.params.id);

router.get("/summary", authorize("inventory.view"), async (_req: Request, res: Response) => {
  sendResponse(res, { message: "Inventory summary", data: await InventoryService.summary() });
});

router.get("/items", authorize("inventory.view"), async (req: Request, res: Response) => {
  const { data, meta } = await InventoryService.listItems(req.query as Record<string, unknown>);
  sendResponse(res, { message: "Items", data, meta });
});

router.post("/items", authorize("inventory.manage"), validateBody(itemSchema), audit("inventory.item_create", "inventory"), async (req: Request, res: Response) => {
  sendResponse(res, { statusCode: 201, message: "Item added", data: await InventoryService.createItem(req.body) });
});

router.get("/items/:id", authorize("inventory.view"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Item", data: await InventoryService.getItem(id(req)) });
});

router.patch("/items/:id", authorize("inventory.manage"), validateBody(itemUpdateSchema), audit("inventory.item_update", "inventory"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Item updated", data: await InventoryService.updateItem(id(req), req.body) });
});

router.get("/movements", authorize("inventory.view"), async (req: Request, res: Response) => {
  const { data, meta } = await InventoryService.listMovements(req.query as Record<string, unknown>);
  sendResponse(res, { message: "Stock movements", data, meta });
});

router.post("/movements", authorize("inventory.manage"), validateBody(movementSchema), audit("inventory.move", "inventory"), async (req: Request, res: Response) => {
  const m = await InventoryService.move(req.user!.company, req.user!.id, req.body);
  sendResponse(res, { statusCode: 201, message: "Stock updated", data: m });
});

export default router;
