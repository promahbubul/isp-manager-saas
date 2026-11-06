import { Request, Response, Router } from "express";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { audit } from "../activityLog/activityLog.service";
import sendResponse from "../../utils/sendResponse";
import { PackageService } from "./package.service";
import { createPackageSchema, updatePackageSchema } from "./package.validation";

const PackageController = {
  list: async (req: Request, res: Response) => {
    const data = await PackageService.list(req.query as Record<string, unknown>);
    sendResponse(res, { message: "Packages", data });
  },
  create: async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: 201, message: "Package created", data: await PackageService.create(req.body) });
  },
  update: async (req: Request, res: Response) => {
    const data = await PackageService.update(String(req.params.id), req.body);
    sendResponse(res, { message: "Package updated", data });
  },
  remove: async (req: Request, res: Response) => {
    await PackageService.remove(String(req.params.id));
    sendResponse(res, { message: "Package deleted" });
  },
};

const router = Router();
router.use(auth(), requireWritableTenant);

router.get("/", PackageController.list); // needed by customer & recharge forms
router.post("/", authorize("package.manage"), validateBody(createPackageSchema), audit("package.create", "package"), PackageController.create);
router.patch("/:id", authorize("package.manage"), validateBody(updatePackageSchema), audit("package.update", "package"), PackageController.update);
router.delete("/:id", authorize("package.manage"), audit("package.delete", "package"), PackageController.remove);

export default router;
