import { Request, Response, Router } from "express";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { audit } from "../activityLog/activityLog.service";
import sendResponse from "../../utils/sendResponse";
import { RouterService } from "./router.service";
import { createRouterSchema, updateRouterSchema } from "./router.validation";

const id = (req: Request) => String(req.params.id);

const RouterController = {
  list: async (_req: Request, res: Response) => {
    sendResponse(res, { message: "Routers", data: await RouterService.list() });
  },
  getById: async (req: Request, res: Response) => {
    sendResponse(res, { message: "Router", data: await RouterService.getById(id(req)) });
  },
  create: async (req: Request, res: Response) => {
    const data = await RouterService.create(req.user!.company, req.body);
    sendResponse(res, { statusCode: 201, message: "Router added", data });
  },
  update: async (req: Request, res: Response) => {
    sendResponse(res, { message: "Router updated", data: await RouterService.update(id(req), req.body) });
  },
  remove: async (req: Request, res: Response) => {
    await RouterService.remove(req.user!.company, id(req));
    sendResponse(res, { message: "Router deleted" });
  },
  test: async (req: Request, res: Response) => {
    sendResponse(res, { message: "Router is online", data: await RouterService.testConnection(id(req)) });
  },
  profiles: async (req: Request, res: Response) => {
    sendResponse(res, { message: "PPP profiles", data: await RouterService.profiles(id(req)) });
  },
  active: async (req: Request, res: Response) => {
    sendResponse(res, { message: "Active sessions", data: await RouterService.activeSessions(id(req)) });
  },
};

const router = Router();
router.use(auth(), requireWritableTenant);

router.get("/", authorize("router.view"), RouterController.list);
router.post("/", authorize("router.manage"), validateBody(createRouterSchema), audit("router.create", "router"), RouterController.create);
router.get("/:id", authorize("router.view"), RouterController.getById);
router.patch("/:id", authorize("router.manage"), validateBody(updateRouterSchema), audit("router.update", "router"), RouterController.update);
router.delete("/:id", authorize("router.manage"), audit("router.delete", "router"), RouterController.remove);
// Connection test is a read in effect, but it records status — allow for router.view.
router.post("/:id/test", authorize("router.view"), RouterController.test);
router.get("/:id/profiles", authorize("router.view"), RouterController.profiles);
router.get("/:id/active", authorize("router.view"), RouterController.active);

export default router;
