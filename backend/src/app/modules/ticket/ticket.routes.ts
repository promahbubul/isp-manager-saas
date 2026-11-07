import { Request, Response, Router } from "express";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { audit } from "../activityLog/activityLog.service";
import { Actor } from "../customer/customer.service";
import { requireFeature } from "../subscription/planFeature";
import AppError from "../../errors/AppError";
import { savePrivateFile, sendPrivateFile, uploadAttachment } from "../../utils/privateFiles";
import { User } from "../user/user.model";
import { assignSchema, commentSchema, createTicketSchema, statusSchema, TicketService, updateTicketSchema } from "./ticket.service";

const actor = (req: Request): Actor => ({
  id: req.user!.id,
  role: req.user!.role,
  company: req.user!.company,
  zones: req.user!.zones,
  reseller: req.user!.reseller,
});
const id = (req: Request) => String(req.params.id);

const router = Router();
router.use(auth(), requireFeature("ticket"), requireWritableTenant);

router.get("/", authorize("ticket.view"), async (req: Request, res: Response) => {
  const { data, meta } = await TicketService.list(actor(req), req.query as Record<string, unknown>);
  sendResponse(res, { message: "Tickets", data, meta });
});

router.get("/counts", authorize("ticket.view"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Ticket counts", data: await TicketService.counts(actor(req)) });
});

/** Active staff who can be assigned (name + role only). */
router.get("/assignees", authorize("ticket.assign"), async (_req: Request, res: Response) => {
  const users = await User.find({ isActive: true, role: { $in: ["owner", "admin", "manager", "technician", "custom"] } })
    .select("name role")
    .sort("name");
  sendResponse(res, { message: "Assignees", data: users });
});

router.post(
  "/",
  authorize("ticket.create"),
  validateBody(createTicketSchema),
  audit("ticket.create", "ticket"),
  async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: 201, message: "Ticket created", data: await TicketService.create(actor(req), req.body) });
  },
);

router.get("/:id", authorize("ticket.view"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Ticket", data: await TicketService.getById(actor(req), id(req)) });
});

router.patch("/:id", authorize("ticket.create"), validateBody(updateTicketSchema), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Ticket updated", data: await TicketService.update(actor(req), id(req), req.body) });
});

router.patch(
  "/:id/assign",
  authorize("ticket.assign"),
  validateBody(assignSchema),
  audit("ticket.assign", "ticket"),
  async (req: Request, res: Response) => {
    const data = await TicketService.assign(actor(req), id(req), req.body.assignedTo);
    sendResponse(res, { message: "Ticket assigned", data });
  },
);

router.patch(
  "/:id/status",
  authorize("ticket.solve"),
  validateBody(statusSchema),
  audit("ticket.status", "ticket"),
  async (req: Request, res: Response) => {
    const data = await TicketService.setStatus(actor(req), id(req), req.body.status, req.body.note);
    sendResponse(res, { message: `Ticket ${data.status.replace("_", " ")}`, data });
  },
);

router.post("/:id/comments", authorize("ticket.view"), validateBody(commentSchema), async (req: Request, res: Response) => {
  sendResponse(res, { statusCode: 201, message: "Comment added", data: await TicketService.comment(actor(req), id(req), req.body.text) });
});


/* ── attachments (photos of the ONU light, fiber damage, PDF reports) ── */
router.post("/:id/attachments", authorize("ticket.view"), uploadAttachment, async (req: Request, res: Response) => {
  if (!req.file) throw new AppError(400, "Attach the file as 'file'");
  const t = await TicketService.getById(actor(req), id(req));
  if ((t.attachments?.length ?? 0) >= 10) throw new AppError(400, "Up to 10 files per complaint");
  const file = await savePrivateFile("tickets", `${req.user!.company}-${t.id}`, req.file.buffer);
  t.attachments.push({ file, name: req.file.originalname.slice(0, 100), size: req.file.size, at: new Date() });
  await t.save();
  sendResponse(res, { statusCode: 201, message: "File attached", data: t.attachments });
});

router.get("/:id/attachments/:file", authorize("ticket.view"), async (req: Request, res: Response) => {
  const t = await TicketService.getById(actor(req), id(req));
  const a = t.attachments?.find((x) => x.file === String(req.params.file));
  if (!a) throw new AppError(404, "File not found");
  sendPrivateFile(res, "tickets", a.file, a.name);
});

export default router;
