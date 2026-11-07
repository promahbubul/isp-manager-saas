import { Request, Response, Router } from "express";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { platformAuth } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { durationToMs } from "../../utils/duration";
import { paginate } from "../../utils/paginate";
import sendResponse from "../../utils/sendResponse";
import { objectId, optionalText } from "../../utils/zod";
import { Announcement } from "../announcement/announcement.model";
import { setTenantRefreshCookie } from "../auth/auth.controller";
import { AuthService } from "../auth/auth.service";
import { Plan } from "../plan/plan.model";
import { PlatformUser } from "../platformUser/platformUser.model";
import {
  AdminService,
  assignPlanSchema,
  extendTrialSchema,
  planSchema,
  planUpdateSchema,
  platformUserSchema,
  platformUserUpdateSchema,
  tenantStatusSchema,
} from "./admin.service";
import { IPlatformAuditLog, platformAudit, PlatformAuditLog } from "./platformAudit";

/** Mounted inside admin.routes.ts (already behind platformAuth super_admin/finance). */
const router = Router();
const superOnly = platformAuth("super_admin");
const id = (req: Request) => String(req.params.id);

/* ── Dashboard ── */
router.get("/metrics", async (_req: Request, res: Response) => {
  sendResponse(res, { message: "Platform metrics", data: await AdminService.metrics() });
});

/* ── Tenants (ISPs) ── */
router.get("/companies", async (req: Request, res: Response) => {
  const { data, meta } = await AdminService.listTenants(req.query as Record<string, unknown>);
  sendResponse(res, { message: "Companies", data, meta });
});

router.get("/companies/:id", async (req: Request, res: Response) => {
  sendResponse(res, { message: "Company", data: await AdminService.tenantDetail(id(req)) });
});

router.patch("/companies/:id/status", superOnly, validateBody(tenantStatusSchema), platformAudit("tenant.status", "company", true), async (req: Request, res: Response) => {
  const c = await AdminService.setTenantStatus(id(req), req.body);
  res.locals.auditSummary = `Status → ${c.status}${req.body.reason ? ` (${req.body.reason})` : ""}`;
  sendResponse(res, { message: `Company ${c.status}`, data: c });
});

router.post("/companies/:id/extend-trial", superOnly, validateBody(extendTrialSchema), platformAudit("tenant.extend_trial", "company", true), async (req: Request, res: Response) => {
  const c = await AdminService.extendTrial(id(req), req.body.days);
  res.locals.auditSummary = `Trial +${req.body.days} days → ${c.trialEndsAt?.toISOString().slice(0, 10)}`;
  sendResponse(res, { message: "Trial extended", data: c });
});

router.post("/companies/:id/assign-plan", superOnly, validateBody(assignPlanSchema), platformAudit("tenant.assign_plan", "company", true), async (req: Request, res: Response) => {
  const r = await AdminService.assignPlan(id(req), req.body);
  res.locals.auditSummary = `Plan ${r.plan} until ${r.periodEnd.toISOString().slice(0, 10)}${req.body.note ? ` — ${req.body.note}` : ""}`;
  sendResponse(res, { message: `${r.plan} assigned`, data: r });
});

/**
 * Log in as the ISP owner for support. Sets a 1-hour tenant session cookie in this
 * browser; every action is marked "[by platform admin]" in the ISP's activity log.
 */
router.post("/companies/:id/impersonate", superOnly, platformAudit("tenant.impersonate", "company", true), async (req: Request, res: Response) => {
  const { company, tokens } = await AuthService.impersonate(id(req), req.platformUser!.id);
  setTenantRefreshCookie(res, tokens.refreshToken, durationToMs("1h"));
  res.locals.auditSummary = `Impersonated owner of ${company.name}`;
  sendResponse(res, { message: `Opening ${company.name} as owner`, data: { accessToken: tokens.accessToken, redirect: "/dashboard" } });
});

/* ── Plans ── */
router.get("/plans", async (_req: Request, res: Response) => {
  sendResponse(res, { message: "Plans", data: await AdminService.listPlans() });
});

router.post("/plans", superOnly, validateBody(planSchema), platformAudit("plan.create", "plan"), async (req: Request, res: Response) => {
  if (await Plan.exists({ slug: req.body.slug })) throw new AppError(409, "A plan with this slug exists");
  sendResponse(res, { statusCode: 201, message: "Plan created", data: await Plan.create({ ...req.body, isTrial: false }) });
});

router.patch("/plans/:id", superOnly, validateBody(planUpdateSchema), platformAudit("plan.update", "plan"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Plan updated", data: await AdminService.updatePlan(id(req), req.body) });
});

/* ── Announcements ── */
const announcementFields = {
  title: z.string().trim().min(3).max(150),
  body: optionalText(1000),
  type: z.enum(["info", "warning", "success"]),
  plans: z.array(objectId),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().nullable(),
  isActive: z.boolean(),
};
const announcementSchema = z.object({
  ...announcementFields,
  type: announcementFields.type.default("info"),
  plans: announcementFields.plans.default([]),
  startAt: announcementFields.startAt.optional(),
  endAt: announcementFields.endAt.optional(),
  isActive: announcementFields.isActive.default(true),
});
// separate update schema without defaults (see planUpdateSchema)
const announcementUpdateSchema = z.object(announcementFields).partial();

router.get("/announcements", async (_req: Request, res: Response) => {
  sendResponse(res, { message: "Announcements", data: await Announcement.find().sort("-createdAt").populate("plans", "name") });
});

router.post("/announcements", superOnly, validateBody(announcementSchema), platformAudit("announcement.create", "announcement"), async (req: Request, res: Response) => {
  sendResponse(res, { statusCode: 201, message: "Announcement published", data: await Announcement.create(req.body) });
});

router.patch(
  "/announcements/:id",
  superOnly,
  validateBody(announcementUpdateSchema),
  platformAudit("announcement.update", "announcement"),
  async (req: Request, res: Response) => {
    const a = await Announcement.findByIdAndUpdate(id(req), { $set: req.body }, { returnDocument: "after" });
    if (!a) throw new AppError(404, "Announcement not found");
    sendResponse(res, { message: "Announcement updated", data: a });
  },
);

/* ── Platform staff ── */
router.get("/platform-users", superOnly, async (_req: Request, res: Response) => {
  sendResponse(res, { message: "Platform users", data: await PlatformUser.find().sort("name") });
});

router.post("/platform-users", superOnly, validateBody(platformUserSchema), platformAudit("platform_user.create", "platform_user"), async (req: Request, res: Response) => {
  if (await PlatformUser.exists({ email: req.body.email })) throw new AppError(409, "Email already used");
  sendResponse(res, { statusCode: 201, message: "Admin created", data: await PlatformUser.create(req.body) });
});

router.patch(
  "/platform-users/:id",
  superOnly,
  validateBody(platformUserUpdateSchema),
  platformAudit("platform_user.update", "platform_user"),
  async (req: Request, res: Response) => {
    sendResponse(res, { message: "Admin updated", data: await AdminService.updatePlatformUser(req.platformUser!.id, id(req), req.body) });
  },
);

/* ── Audit log ── */
router.get("/audit-logs", async (req: Request, res: Response) => {
  const q = req.query as Record<string, unknown>;
  const filter: Record<string, unknown> = {};
  if (typeof q.company === "string" && q.company) filter.company = q.company;
  const { data, meta } = await paginate<IPlatformAuditLog>(PlatformAuditLog, filter, q, {
    searchFields: ["action", "summary"],
    filterFields: ["target"],
    populate: [
      { path: "platformUser", select: "name role" },
      { path: "company", select: "name slug" },
    ],
  });
  sendResponse(res, { message: "Audit log", data, meta });
});

export default router;
