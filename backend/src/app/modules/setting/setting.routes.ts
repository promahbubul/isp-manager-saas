import { Request, Response, Router } from "express";
import { z } from "zod";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { optionalText } from "../../utils/zod";
import { audit } from "../activityLog/activityLog.service";
import { bdPhone } from "../auth/auth.validation";
import { Company } from "../company/company.model";
import AppError from "../../errors/AppError";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import config from "../../config";
import { imageExtension, uploadImage } from "../../middlewares/upload";
import { streamTenantExport } from "../admin/tenantData";
import { getSettings } from "./setting.model";

const updateSettingSchema = z
  .object({
    billing: z
      .object({ graceDays: z.coerce.number().int().min(0).max(30), autoDisable: z.boolean() })
      .partial(),
    receipt: z.object({ header: optionalText(200), footer: optionalText(300) }).partial(),
    notifications: z.object({ dailySummaryEmail: z.boolean() }).partial(),
    ticket: z
      .object({ slaHours: z.object({ low: z.coerce.number().int().min(1).max(720), medium: z.coerce.number().int().min(1).max(720), high: z.coerce.number().int().min(1).max(720) }).partial() })
      .partial(),
    sms: z
      .object({
        autoEvents: z
          .object({
            welcome: z.boolean(),
            payment_success: z.boolean(),
            expiry_reminder: z.boolean(),
            expired: z.boolean(),
            ticket_update: z.boolean(),
          })
          .partial(),
        reminderDaysBefore: z.coerce.number().int().min(1).max(10),
      })
      .partial(),
  })
  .partial();

const router = Router();
router.use(auth(), requireWritableTenant);

router.get("/", async (req: Request, res: Response) => {
  sendResponse(res, { message: "Settings", data: await getSettings(req.user!.company) });
});

/* ── Company profile (shown on receipts, payment page, SMS {company}) ── */

const companyProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: bdPhone,
    email: z.email().trim().toLowerCase(),
    address: optionalText(300),
    district: optionalText(60),
    btrcLicenseNo: optionalText(60),
    licenseType: z.enum(["nationwide", "divisional", "district", "upazila"]).optional(),
    logo: z.union([z.url().max(500), z.literal("")]).optional(),
    portalColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #2563eb")
      .optional(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update");

const COMPANY_FIELDS = "name slug phone email address district btrcLicenseNo licenseType logo portalTheme";

router.get("/company", async (req: Request, res: Response) => {
  sendResponse(res, { message: "Company profile", data: await Company.findById(req.user!.company).select(COMPANY_FIELDS) });
});

router.patch(
  "/company",
  authorize("setting.manage"),
  validateBody(companyProfileSchema),
  audit("setting.company_profile", "setting"),
  async (req: Request, res: Response) => {
    const { portalColor, logo, ...rest } = req.body as z.infer<typeof companyProfileSchema>;
    const $set: Record<string, unknown> = { ...rest };
    const $unset: Record<string, 1> = {};
    if (portalColor) $set["portalTheme.primaryColor"] = portalColor;
    if (logo) $set.logo = logo;
    else if (logo === "") $unset.logo = 1;
    const company = await Company.findByIdAndUpdate(
      req.user!.company,
      { $set, ...(Object.keys($unset).length ? { $unset } : {}) },
      { returnDocument: "after" },
    ).select(COMPANY_FIELDS);
    sendResponse(res, { message: "Company profile saved", data: company });
  },
);

/** Upload the ISP's logo (receipts, portal, pay page). Replaces the previous uploaded file. */
router.post("/company/logo", authorize("setting.manage"), uploadImage, audit("setting.logo", "setting"), async (req: Request, res: Response) => {
  if (!req.file) throw new AppError(400, "Attach the image as 'file'");
  const ext = imageExtension(req.file.buffer);
  if (!ext) throw new AppError(400, "The file is not a valid PNG, JPG or WebP image");
  const name = `${req.user!.company}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(config.uploadDir, "logos", name), req.file.buffer);

  const company = await Company.findById(req.user!.company).select(COMPANY_FIELDS);
  const prefix = `${config.apiPublicUrl}/uploads/logos/`;
  const old = company!.logo?.startsWith(prefix) ? path.basename(company!.logo.slice(prefix.length)) : null;
  company!.logo = prefix + name;
  await company!.save();
  if (old) await fs.unlink(path.join(config.uploadDir, "logos", old)).catch(() => undefined);
  sendResponse(res, { message: "Logo updated", data: company });
});

router.patch("/", authorize("setting.manage"), validateBody(updateSettingSchema), audit("setting.update", "setting"), async (req: Request, res: Response) => {
  const settings = await getSettings(req.user!.company);
  const body = req.body as z.infer<typeof updateSettingSchema>;
  if (body.billing) settings.set("billing", { ...settings.toObject().billing, ...body.billing });
  if (body.receipt) settings.set("receipt", { ...settings.toObject().receipt, ...body.receipt });
  if (body.notifications) settings.set("notifications", { ...settings.toObject().notifications, ...body.notifications });
  if (body.ticket?.slaHours) settings.set("ticket.slaHours", { ...settings.toObject().ticket?.slaHours, ...body.ticket.slaHours });
  if (body.sms) {
    const cur = settings.toObject().sms;
    settings.set("sms", {
      ...cur,
      ...body.sms,
      autoEvents: { ...cur.autoEvents, ...(body.sms.autoEvents ?? {}) },
    });
  }
  await settings.save();
  sendResponse(res, { message: "Settings saved", data: settings });
});

/** Owner-only full JSON export of the ISP's data (leaving, migrating, own backup). Works while lapsed too. */
router.get("/export", audit("company.export", "company"), async (req: Request, res: Response) => {
  if (req.user!.role !== "owner") throw new AppError(403, "Only the owner can export all data");
  await streamTenantExport(req.user!.company, res);
});

export default router;
