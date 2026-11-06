import { Request, Response, Router } from "express";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { audit } from "../activityLog/activityLog.service";
import sendResponse from "../../utils/sendResponse";
import { ZoneService } from "./zone.service";
import { createZoneSchema, updateZoneSchema } from "./zone.validation";

const ZoneController = {
  list: async (_req: Request, res: Response) => {
    sendResponse(res, { message: "Zones", data: await ZoneService.list() });
  },
  create: async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: 201, message: "Zone created", data: await ZoneService.create(req.body) });
  },
  update: async (req: Request, res: Response) => {
    sendResponse(res, { message: "Zone updated", data: await ZoneService.update(String(req.params.id), req.body) });
  },
  remove: async (req: Request, res: Response) => {
    await ZoneService.remove(String(req.params.id));
    sendResponse(res, { message: "Zone deleted" });
  },
};

const router = Router();
router.use(auth(), requireWritableTenant);

// Any staff member may read zones (needed for customer forms and filters).
router.get("/", ZoneController.list);
router.post("/", authorize("zone.manage"), validateBody(createZoneSchema), audit("zone.create", "zone"), ZoneController.create);
router.patch("/:id", authorize("zone.manage"), validateBody(updateZoneSchema), audit("zone.update", "zone"), ZoneController.update);
router.delete("/:id", authorize("zone.manage"), audit("zone.delete", "zone"), ZoneController.remove);

export default router;
