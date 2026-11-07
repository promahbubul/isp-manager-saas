import { Request, Response, Router } from "express";
import { auth, authorize } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { platformAudit } from "../admin/platformAudit";
import { createSupportSchema, platformReplySchema, supportMessageSchema, supportStatusSchema, SupportService } from "./support.service";

const id = (req: Request) => String(req.params.id);

/**
 * ISP → platform support: /support
 * No requireWritableTenant on purpose — a suspended or lapsed ISP must still be able to reach us.
 */
export const ispSupportRoutes = Router();
ispSupportRoutes.use(auth(), authorize("setting.manage"));

const actor = (req: Request) => ({ id: req.user!.id, company: req.user!.company, impersonatedBy: req.user!.impersonatedBy });

ispSupportRoutes.get("/", async (req: Request, res: Response) => {
  const { data, meta } = await SupportService.listForIsp(req.query as Record<string, unknown>);
  sendResponse(res, { message: "Support tickets", data, meta });
});

ispSupportRoutes.post("/", validateBody(createSupportSchema), async (req: Request, res: Response) => {
  sendResponse(res, { statusCode: 201, message: "Sent to platform support", data: await SupportService.create(actor(req), req.body) });
});

ispSupportRoutes.get("/:id", async (req: Request, res: Response) => {
  sendResponse(res, { message: "Support ticket", data: await SupportService.getForIsp(id(req)) });
});

ispSupportRoutes.post("/:id/messages", validateBody(supportMessageSchema), async (req: Request, res: Response) => {
  sendResponse(res, { statusCode: 201, message: "Message sent", data: await SupportService.ispReply(actor(req), id(req), req.body.text) });
});

ispSupportRoutes.post("/:id/close", async (req: Request, res: Response) => {
  sendResponse(res, { message: "Ticket closed", data: await SupportService.ispClose(id(req)) });
});

/** Platform side: /admin/support-tickets (mounted behind platformAuth, every platform role). */
export const platformSupportRoutes = Router();

platformSupportRoutes.get("/", async (req: Request, res: Response) => {
  const { data, meta, counts } = await SupportService.listForPlatform(req.query as Record<string, unknown>);
  sendResponse(res, { message: "Support tickets", data: { tickets: data, counts }, meta });
});

platformSupportRoutes.get("/:id", async (req: Request, res: Response) => {
  sendResponse(res, { message: "Support ticket", data: await SupportService.getForPlatform(id(req)) });
});

platformSupportRoutes.post("/:id/reply", validateBody(platformReplySchema), platformAudit("support.reply", "support_ticket"), async (req: Request, res: Response) => {
  const t = await SupportService.platformReply(req.platformUser!.id, id(req), req.body);
  res.locals.auditSummary = `Replied to ${t.ref}${req.body.close ? " and closed it" : ""}`;
  sendResponse(res, { statusCode: 201, message: req.body.close ? "Reply sent, ticket closed" : "Reply sent", data: t });
});

platformSupportRoutes.patch("/:id/status", validateBody(supportStatusSchema), platformAudit("support.status", "support_ticket"), async (req: Request, res: Response) => {
  sendResponse(res, { message: `Ticket ${req.body.status}`, data: await SupportService.setStatus(id(req), req.body.status) });
});
