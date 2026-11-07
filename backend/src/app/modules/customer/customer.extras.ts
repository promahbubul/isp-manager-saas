import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Request, Response, Router } from "express";
import multer from "multer";
import mongoose, { Types } from "mongoose";
import { z } from "zod";
import config from "../../config";
import AppError from "../../errors/AppError";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { imageExtension } from "../../middlewares/upload";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { objectId, optionalText } from "../../utils/zod";
import { ActivityLog } from "../activityLog/activityLog.model";
import { audit } from "../activityLog/activityLog.service";
import { nextSequence } from "../counter/counter.model";
import { Package } from "../package/package.model";
import { Payment, PAYMENT_METHODS } from "../payment/payment.model";
import { SmsLog } from "../sms/sms.model";
import { Ticket } from "../ticket/ticket.model";
import { Customer } from "./customer.model";
import { Actor, CustomerService, customerScope, findCustomerOrThrow } from "./customer.service";

const actor = (req: Request): Actor => ({ id: req.user!.id, role: req.user!.role, company: req.user!.company, zones: req.user!.zones, reseller: req.user!.reseller });

/* ───────────── documents: photo, NID front/back (private) ───────────── */

export const DOC_KINDS = ["photo", "nidFront", "nidBack"] as const;
type DocKind = (typeof DOC_KINDS)[number];

/** NID images are personal data: kept outside the public /uploads folder and served only to staff. */
const privateDir = () => path.join(config.uploadDir, "private", "customers");

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (/^image\/(png|jpeg|webp)$/.test(file.mimetype) ? cb(null, true) : cb(new AppError(400, "Upload a PNG, JPG or WebP image"))),
}).single("file");

/* ───────────── timeline ───────────── */

async function timeline(a: Actor, id: string) {
  const c = await findCustomerOrThrow(a, id);
  const [payments, tickets, sms, logs] = await Promise.all([
    Payment.find({ customer: c._id }).sort("-createdAt").limit(100).select("receiptNo type amount months method status newExpiry createdAt").populate("receivedBy", "name"),
    Ticket.find({ customer: c._id }).sort("-createdAt").limit(50).select("ticketNo subject status createdAt solvedAt"),
    SmsLog.find({ customer: c._id }).sort("-createdAt").limit(50).select("event status message createdAt"),
    ActivityLog.find({ entity: "customer", entityId: String(c._id) }).sort("-createdAt").limit(100).select("action summary changes createdAt").populate("user", "name"),
  ]);
  const events = [
    ...payments.map((p) => ({ at: p.get("createdAt") as Date, kind: "payment", title: `${p.type === "recharge" ? "Recharge" : p.type.replace("_", " ")} ৳${p.amount} (${p.method})${p.status === "refunded" ? " — refunded" : ""}`, detail: p.receiptNo, ref: p._id })),
    ...tickets.map((t) => ({ at: t.get("createdAt") as Date, kind: "ticket", title: `Complaint ${t.ticketNo}: ${t.subject}`, detail: t.status, ref: t._id })),
    ...sms.map((s) => ({ at: s.get("createdAt") as Date, kind: "sms", title: `SMS ${s.event} — ${s.status}`, detail: s.message.slice(0, 120) })),
    ...logs
      .filter((l) => l.action !== "payment.recharge")
      .map((l) => ({ at: l.get("createdAt") as Date, kind: "change", title: l.summary || l.action, detail: l.changes?.map((ch) => `${ch.field}: ${String(ch.from ?? "—")} → ${String(ch.to ?? "—")}`).join("; "), by: (l.user as unknown as { name?: string })?.name })),
  ];
  return events.sort((x, y) => y.at.getTime() - x.at.getTime()).slice(0, 200);
}

/* ───────────── bulk actions ───────────── */

export const bulkSchema = z
  .object({
    ids: z.array(objectId).min(1).max(500).optional(),
    /** or every customer in a zone */
    zone: objectId.optional(),
    action: z.enum(["enable", "disable", "package"]),
    package: objectId.optional(),
  })
  .refine((d) => d.ids || d.zone, "Choose customers or a zone")
  .refine((d) => d.action !== "package" || d.package, { path: ["package"], message: "Choose the new package" });

async function bulk(a: Actor, input: z.infer<typeof bulkSchema>) {
  const filter: Record<string, unknown> = { ...customerScope(a), status: { $ne: "left" } };
  if (input.ids) filter._id = { $in: input.ids };
  if (input.zone) filter.zone = input.zone;
  const customers = await Customer.find(filter).select("_id status").limit(500);
  const result = { total: customers.length, done: 0, skipped: 0, routerFailed: 0 };
  for (const c of customers) {
    try {
      let sync: { ok: boolean } | undefined;
      if (input.action === "enable") {
        if (c.status !== "disabled") {
          result.skipped += 1;
          continue;
        }
        sync = (await CustomerService.setEnabled(a, c.id, true)).sync;
      } else if (input.action === "disable") {
        if (c.status === "disabled") {
          result.skipped += 1;
          continue;
        }
        sync = (await CustomerService.setEnabled(a, c.id, false)).sync;
      } else {
        sync = (await CustomerService.update(a, c.id, { package: input.package })).sync;
      }
      result.done += 1;
      if (sync && !sync.ok) result.routerFailed += 1;
    } catch {
      result.skipped += 1;
    }
  }
  return result;
}

/* ───────────── package change with proration ───────────── */

export const changePackageSchema = z.object({
  package: objectId,
  /**
   * now      — switch now, keep expiry (simple)
   * prorate  — switch now, convert the unused days to the new price (cheaper → more days, dearer → fewer)
   * next     — keep the current package until expiry; the new one starts at the next recharge
   */
  mode: z.enum(["now", "prorate", "next"]).default("now"),
});

async function changePackage(a: Actor, id: string, input: z.infer<typeof changePackageSchema>) {
  const c = await findCustomerOrThrow(a, id);
  const [from, to] = await Promise.all([Package.findById(c.package), Package.findById(input.package)]);
  if (!to || !to.isActive) throw new AppError(400, "Package not found or inactive");
  if (String(c.package) === input.package) throw new AppError(400, "Already on this package");
  if (input.mode === "next") {
    await Customer.updateOne({ _id: c._id }, { pendingPackage: to._id });
    return { mode: "next", message: `${to.name} starts at the next recharge`, customer: await Customer.findById(c._id) };
  }
  const result = await CustomerService.update(a, id, { package: input.package });
  if (input.mode === "prorate" && from && c.billingType === "prepaid" && c.expiryDate > new Date()) {
    const msLeft = c.expiryDate.getTime() - Date.now();
    const oldDaily = Math.max(0, c.monthlyFee - c.discount) / (from.validityDays || 30);
    const newDaily = Math.max(0, to.price - c.discount) / (to.validityDays || 30);
    if (oldDaily > 0 && newDaily > 0) {
      const newMsLeft = (msLeft * oldDaily) / newDaily;
      const expiryDate = new Date(Date.now() + newMsLeft);
      await CustomerService.update(a, id, { expiryDate });
      return { mode: "prorate", message: `${to.name} from now; validity adjusted to ${expiryDate.toISOString().slice(0, 10)}`, customer: await Customer.findById(c._id), sync: result.sync };
    }
  }
  return { mode: "now", message: `${to.name} from now`, customer: result.customer, sync: result.sync };
}

/* ───────────── other charges: connection fee, device sale ───────────── */

export const chargeSchema = z
  .object({
    customer: objectId,
    type: z.enum(["connection_fee", "other"]),
    amount: z.coerce.number().positive().max(1_000_000),
    method: z.enum(PAYMENT_METHODS).default("cash"),
    trxId: optionalText(60),
    note: z.string().trim().min(2, "Write what it is for (e.g. ONU sale)").max(300),
    /** charge now but collect later: adds to the customer's due instead of a payment */
    addToDue: z.boolean().default(false),
  });

async function charge(a: Actor, input: z.infer<typeof chargeSchema>) {
  const c = await findCustomerOrThrow(a, input.customer);
  if (input.addToDue) {
    await Customer.updateOne({ _id: c._id }, { $inc: { dueAmount: input.amount } });
    return { addedToDue: input.amount, payment: null };
  }
  const session = await mongoose.startSession();
  try {
    let id!: Types.ObjectId;
    await session.withTransaction(async () => {
      const [p] = await Payment.create(
        [
          {
            company: a.company,
            receiptNo: await nextSequence(a.company, "receipt", session),
            customer: c._id,
            type: input.type,
            amount: input.amount,
            billAmount: input.amount,
            months: 0,
            method: input.method,
            trxId: input.trxId,
            previousExpiry: c.expiryDate,
            newExpiry: c.expiryDate,
            previousDue: c.dueAmount,
            dueAfter: c.dueAmount,
            receivedBy: a.id,
            source: "staff",
            note: input.note,
          },
        ],
        { session },
      );
      id = p._id;
    });
    return { payment: await Payment.findById(id) };
  } finally {
    await session.endSession();
  }
}

/* ───────────── routes (mounted at /customers before the main customer router) ───────────── */

export const customerExtraRoutes = Router();
customerExtraRoutes.use(auth(), requireWritableTenant);

customerExtraRoutes.post("/bulk", authorize("customer.edit", "customer.enable_disable"), validateBody(bulkSchema), audit("customer.bulk", "customer"), async (req: Request, res: Response) => {
  const r = await bulk(actor(req), req.body);
  res.locals.auditSummary = `Bulk ${req.body.action}: ${r.done} done, ${r.skipped} skipped`;
  sendResponse(res, { message: `${r.done} of ${r.total} updated${r.routerFailed ? `, router sync failed for ${r.routerFailed}` : ""}`, data: r });
});

customerExtraRoutes.post("/charges", authorize("payment.recharge"), validateBody(chargeSchema), audit("payment.charge", "payment"), async (req: Request, res: Response) => {
  const r = await charge(actor(req), req.body);
  sendResponse(res, { statusCode: 201, message: r.payment ? `Received ৳${r.payment.amount} — receipt ${r.payment.receiptNo}` : `৳${r.addedToDue} added to the customer's due`, data: r });
});

customerExtraRoutes.get("/:id/timeline", authorize("customer.view"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Timeline", data: await timeline(actor(req), String(req.params.id)) });
});

customerExtraRoutes.post("/:id/change-package", authorize("customer.edit"), validateBody(changePackageSchema), audit("customer.change_package", "customer"), async (req: Request, res: Response) => {
  const r = await changePackage(actor(req), String(req.params.id), req.body);
  sendResponse(res, { message: r.message, data: r });
});

customerExtraRoutes.post("/:id/documents/:kind", authorize("customer.edit"), uploadDoc, audit("customer.document", "customer"), async (req: Request, res: Response) => {
  const kind = String(req.params.kind) as DocKind;
  if (!DOC_KINDS.includes(kind)) throw new AppError(400, "Use photo, nidFront or nidBack");
  if (!req.file) throw new AppError(400, "Attach the image as 'file'");
  const ext = imageExtension(req.file.buffer);
  if (!ext) throw new AppError(400, "The file is not a valid PNG, JPG or WebP image");
  const c = await findCustomerOrThrow(actor(req), String(req.params.id));
  await fs.mkdir(privateDir(), { recursive: true });
  const name = `${req.user!.company}-${c.id}-${kind}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(privateDir(), name), req.file.buffer);
  const old = c.documents?.[kind];
  await Customer.updateOne({ _id: c._id }, { [`documents.${kind}`]: name });
  if (old) await fs.unlink(path.join(privateDir(), path.basename(old))).catch(() => undefined);
  sendResponse(res, { message: kind === "photo" ? "Photo saved" : "NID image saved", data: { kind } });
});

customerExtraRoutes.get("/:id/documents/:kind", authorize("customer.view"), async (req: Request, res: Response) => {
  const kind = String(req.params.kind) as DocKind;
  if (!DOC_KINDS.includes(kind)) throw new AppError(400, "Unknown document");
  const c = await findCustomerOrThrow(actor(req), String(req.params.id));
  const file = c.documents?.[kind];
  if (!file) throw new AppError(404, "Not uploaded");
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(path.join(privateDir(), path.basename(file)));
});

