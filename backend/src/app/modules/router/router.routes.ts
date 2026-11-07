import { Request, Response, Router } from "express";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { audit, trackChanges } from "../activityLog/activityLog.service";
import sendResponse from "../../utils/sendResponse";
import { RouterService } from "./router.service";
import { createRouterSchema, updateRouterSchema } from "./router.validation";
import { z } from "zod";
import { disableRouterVpn, enableRouterVpn } from "../../services/wireguard/wireguard.service";
import { enableRouterSstp, writeSstpSecrets } from "../../services/wireguard/sstp.service";
import { radiusSetup, writeRadiusClients } from "../../services/radius/radius.service";
import { MikrotikRouter } from "./router.model";
import AppError from "../../errors/AppError";

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
router.patch("/:id", authorize("router.manage"), validateBody(updateRouterSchema), trackChanges(MikrotikRouter), audit("router.update", "router"), RouterController.update);
router.delete("/:id", authorize("router.manage"), audit("router.delete", "router"), RouterController.remove);
// Connection test is a read in effect, but it records status — allow for router.view.
router.post("/:id/test", authorize("router.view"), RouterController.test);
router.get("/:id/profiles", authorize("router.view"), RouterController.profiles);
router.get("/:id/active", authorize("router.view"), RouterController.active);

/** RADIUS mode: returns the MikroTik commands (and adds the router to FreeRADIUS clients). */
router.post("/:id/radius", authorize("router.manage"), audit("router.radius_enable", "router"), async (req: Request, res: Response) => {
  if (!(await MikrotikRouter.exists({ _id: String(req.params.id) }))) throw new AppError(404, "Router not found");
  const r = await radiusSetup(String(req.params.id));
  sendResponse(res, { message: "RADIUS mode on. Paste the script into the router, then restart FreeRADIUS if the platform admin manages it.", data: r });
});

router.delete("/:id/radius", authorize("router.manage"), audit("router.radius_disable", "router"), async (req: Request, res: Response) => {
  const r = await MikrotikRouter.findOneAndUpdate({ _id: String(req.params.id) }, { authMode: "secret" }, { returnDocument: "after" });
  if (!r) throw new AppError(404, "Router not found");
  await writeRadiusClients().catch(() => undefined);
  sendResponse(res, { message: "Back to router secrets. Use Check sync → Fix all to push every customer to the router.", data: r });
});

/** VPN mode: router without a public IP dials our WireGuard server. Returns the RouterOS script. */
router.post("/:id/vpn", authorize("router.manage"), audit("router.vpn_enable", "router"), async (req: Request, res: Response) => {
  if (!(await MikrotikRouter.exists({ _id: String(req.params.id) }))) throw new AppError(404, "Router not found");
  const type = req.body?.type === "sstp" ? "sstp" : "wireguard";
  const { router: r, script } = type === "sstp" ? await enableRouterSstp(String(req.params.id)) : await enableRouterVpn(String(req.params.id));
  if (type === "wireguard") await writeSstpSecrets().catch(() => undefined); // it may have been an SSTP router before
  sendResponse(res, { message: "VPN ready. Paste the script into the router's terminal.", data: { router: r, script } });
});

router.delete("/:id/vpn", authorize("router.manage"), validateBody(z.object({ host: z.string().trim().min(3).max(255) })), audit("router.vpn_disable", "router"), async (req: Request, res: Response) => {
  if (!(await MikrotikRouter.exists({ _id: String(req.params.id) }))) throw new AppError(404, "Router not found");
  const data = await disableRouterVpn(String(req.params.id), req.body.host);
  await writeSstpSecrets().catch(() => undefined);
  sendResponse(res, { message: "Router switched back to its public address", data });
});

export default router;
