import { Request, Response, Router } from "express";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { Customer } from "./customer.model";
import { audit, trackChanges } from "../activityLog/activityLog.service";
import AppError from "../../errors/AppError";
import { uploadExcel } from "../../middlewares/upload";
import { sendXlsx } from "../../services/excel/excel.service";
import {
  exportCustomers,
  importCustomersFromExcel,
  importFromMikrotik,
  importTemplate,
  mikrotikImportPreview,
  mikrotikImportSchema,
} from "./customer.import";
import { Actor, CustomerService } from "./customer.service";
import { createCustomerSchema, updateCustomerSchema } from "./customer.validation";

const actor = (req: Request): Actor => ({
  id: req.user!.id,
  role: req.user!.role,
  company: req.user!.company,
  zones: req.user!.zones,
  reseller: req.user!.reseller,
});
const id = (req: Request) => String(req.params.id);

const syncMessage = (base: string, sync?: { ok: boolean; error?: string }) =>
  sync && !sync.ok ? `${base}, but router sync failed: ${sync.error}` : base;

const CustomerController = {
  list: async (req: Request, res: Response) => {
    const { data, meta } = await CustomerService.list(actor(req), req.query as Record<string, unknown>);
    sendResponse(res, { message: "Customers", data, meta });
  },
  getById: async (req: Request, res: Response) => {
    sendResponse(res, { message: "Customer", data: await CustomerService.getById(actor(req), id(req)) });
  },
  create: async (req: Request, res: Response) => {
    const data = await CustomerService.create(actor(req), req.body);
    sendResponse(res, { statusCode: 201, message: syncMessage("Customer created", data.sync), data });
  },
  update: async (req: Request, res: Response) => {
    const data = await CustomerService.update(actor(req), id(req), req.body);
    sendResponse(res, { message: syncMessage("Customer updated", data.sync), data });
  },
  enable: async (req: Request, res: Response) => {
    const data = await CustomerService.setEnabled(actor(req), id(req), true);
    sendResponse(res, { message: syncMessage("Customer enabled", data.sync), data });
  },
  disable: async (req: Request, res: Response) => {
    const data = await CustomerService.setEnabled(actor(req), id(req), false);
    sendResponse(res, { message: syncMessage("Customer disabled", data.sync), data });
  },
  kick: async (req: Request, res: Response) => {
    const data = await CustomerService.kick(actor(req), id(req));
    sendResponse(res, { message: data.kicked ? "Session disconnected" : "Customer was not online", data });
  },
  live: async (req: Request, res: Response) => {
    sendResponse(res, { message: "Live status", data: await CustomerService.liveStatus(actor(req), id(req)) });
  },
  sync: async (req: Request, res: Response) => {
    const data = await CustomerService.resync(actor(req), id(req));
    sendResponse(res, { message: syncMessage("Synced with router", data.sync), data });
  },
  credentials: async (req: Request, res: Response) => {
    sendResponse(res, { message: "PPPoE credentials", data: await CustomerService.credentials(actor(req), id(req)) });
  },
  remove: async (req: Request, res: Response) => {
    const sync = await CustomerService.remove(actor(req), id(req));
    sendResponse(res, { message: syncMessage("Customer removed", sync), data: { sync } });
  },
};

const router = Router();
router.use(auth(), requireWritableTenant);

router.get("/", authorize("customer.view"), CustomerController.list);
router.post("/", authorize("customer.create"), validateBody(createCustomerSchema), audit("customer.create", "customer"), CustomerController.create);

// ── Import / export (must stay above "/:id") ──
router.get("/export", authorize("customer.export"), async (req: Request, res: Response) => {
  const buffer = await exportCustomers(actor(req), req.query as Record<string, unknown>);
  sendXlsx(res, `customers-${new Date().toISOString().slice(0, 10)}.xlsx`, buffer);
});
router.get("/import/template", authorize("customer.import"), async (_req: Request, res: Response) => {
  sendXlsx(res, "customer-import-template.xlsx", await importTemplate());
});
router.post("/import", authorize("customer.import"), uploadExcel, audit("customer.import", "customer"), async (req: Request, res: Response) => {
  if (!req.file) throw new AppError(400, "Attach the Excel file as 'file'");
  const commit = req.query.commit === "true";
  const data = await importCustomersFromExcel(actor(req), req.file.buffer, commit);
  res.locals.auditSummary = commit ? `Excel import: ${data.created} created, ${data.invalid} skipped` : undefined;
  const message = commit ? `${data.created} customer(s) imported` : `${data.valid} of ${data.total} row(s) are valid`;
  sendResponse(res, { message, data });
});
router.get("/import/mikrotik/:routerId", authorize("customer.import"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Router secrets", data: await mikrotikImportPreview(String(req.params.routerId)) });
});
router.post(
  "/import/mikrotik/:routerId",
  authorize("customer.import"),
  validateBody(mikrotikImportSchema),
  audit("customer.import_mikrotik", "customer"),
  async (req: Request, res: Response) => {
    const data = await importFromMikrotik(actor(req), String(req.params.routerId), req.body);
    res.locals.auditSummary = `MikroTik import: ${data.created} created, ${data.errors.length} skipped`;
    sendResponse(res, { message: `${data.created} customer(s) imported`, data });
  },
);

router.get("/:id",authorize("customer.view"), CustomerController.getById);
router.patch("/:id", authorize("customer.edit"), validateBody(updateCustomerSchema), trackChanges(Customer), audit("customer.update", "customer"), CustomerController.update);
router.delete("/:id", authorize("customer.delete"), audit("customer.delete", "customer"), CustomerController.remove);
router.patch("/:id/enable", authorize("customer.enable_disable"), audit("customer.enable", "customer"), CustomerController.enable);
router.patch("/:id/disable", authorize("customer.enable_disable"), audit("customer.disable", "customer"), CustomerController.disable);
router.post("/:id/kick", authorize("customer.kick"), audit("customer.kick", "customer"), CustomerController.kick);
router.get("/:id/live", authorize("customer.view"), CustomerController.live);
router.post("/:id/sync", authorize("customer.edit"), CustomerController.sync);
router.get("/:id/credentials", authorize("customer.edit"), audit("customer.view_password", "customer"), CustomerController.credentials);

export default router;
