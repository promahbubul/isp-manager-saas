import { Request, Response, Router } from "express";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { audit } from "../activityLog/activityLog.service";
import { Actor } from "../customer/customer.service";
import { User } from "../user/user.model";
import { assignSchema, commentSchema, createTicketSchema, statusSchema, TicketService, updateTicketSchema } from "./ticket.service";

const actor = (req: Request): Actor => ({
  id: req.user!.id,
  role: req.user!.role,
  company: req.user!.company,
  zones: req.user!.zones,
});
const id = (req: Request) => String(req.params.id);

const router = Router();
router.use(auth(), requireWritableTenant);

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

export default router;
