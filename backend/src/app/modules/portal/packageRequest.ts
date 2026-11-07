import { Request, Response, Router } from "express";
import { isValidObjectId, model, Schema, Types } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { tenantPlugin } from "../../plugins/tenant.plugin";
import { paginate } from "../../utils/paginate";
import sendResponse from "../../utils/sendResponse";
import { optionalText } from "../../utils/zod";
import { audit } from "../activityLog/activityLog.service";
import { CustomerService } from "../customer/customer.service";
import { notifyRoles } from "../notification/notification.service";

/** Customer asks (from the portal) to move to another package; staff approve it. */
export interface IPackageRequest {
  company: Types.ObjectId;
  customer: Types.ObjectId;
  fromPackage: Types.ObjectId;
  toPackage: Types.ObjectId;
  note?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decidedBy?: Types.ObjectId;
  decidedAt?: Date;
  decisionNote?: string;
}

const schema = new Schema<IPackageRequest>(
  {
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    fromPackage: { type: Schema.Types.ObjectId, ref: "Package", required: true },
    toPackage: { type: Schema.Types.ObjectId, ref: "Package", required: true },
    note: { type: String, maxlength: 300 },
    status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], default: "pending" },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    decidedAt: Date,
    decisionNote: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);
schema.plugin(tenantPlugin);
schema.index({ company: 1, status: 1, createdAt: -1 });
schema.index({ company: 1, customer: 1, status: 1 });

export const PackageRequest = model<IPackageRequest>("PackageRequest", schema);

export const packageRequestSchema = z.object({ package: z.string().refine((v) => isValidObjectId(v), "Choose a package"), note: optionalText(300) });

export async function notifyNewRequest(company: string, customerName: string, requestId: string) {
  await notifyRoles(company, ["owner", "admin", "manager"], { title: `Package change request from ${customerName}`, body: "Approve or reject it under Customers → Package requests", link: `/dashboard/customers/package-requests?focus=${requestId}` });
}

/* ── staff side: /package-requests ── */
export const packageRequestRoutes = Router();
packageRequestRoutes.use(auth(), requireWritableTenant);

packageRequestRoutes.get("/", authorize("customer.view"), async (req: Request, res: Response) => {
  const q = req.query as Record<string, unknown>;
  const { data, meta } = await paginate<IPackageRequest>(PackageRequest, {}, { status: "pending", ...q }, {
    filterFields: ["status"],
    populate: [
      { path: "customer", select: "name customerId phone monthlyFee" },
      { path: "fromPackage", select: "name price speedDown" },
      { path: "toPackage", select: "name price speedDown" },
      { path: "decidedBy", select: "name" },
    ],
  });
  sendResponse(res, { message: "Package requests", data, meta });
});

packageRequestRoutes.post(
  "/:id/decide",
  authorize("customer.edit"),
  validateBody(z.object({ approve: z.boolean(), note: optionalText(300) })),
  audit("customer.package_request", "customer"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!isValidObjectId(id)) throw new AppError(400, "Invalid id");
    const r = await PackageRequest.findById(id);
    if (!r) throw new AppError(404, "Request not found");
    if (r.status !== "pending") throw new AppError(400, `Already ${r.status}`);
    let sync;
    if (req.body.approve) {
      const actor = { id: req.user!.id, role: req.user!.role, company: req.user!.company, zones: req.user!.zones, reseller: req.user!.reseller };
      // Same path as staff editing the customer: new price + new profile pushed to the router.
      sync = (await CustomerService.update(actor, String(r.customer), { package: String(r.toPackage) })).sync;
    }
    r.set({ status: req.body.approve ? "approved" : "rejected", decidedBy: req.user!.id, decidedAt: new Date(), decisionNote: req.body.note });
    await r.save();
    sendResponse(res, { message: req.body.approve ? "Package changed" : "Request rejected", data: { request: r, sync } });
  },
);
