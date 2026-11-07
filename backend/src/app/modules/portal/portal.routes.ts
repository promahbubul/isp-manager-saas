import { NextFunction, Request, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import config from "../../config";
import AppError from "../../errors/AppError";
import { validateBody } from "../../middlewares/validateRequest";
import { verifyAccessToken } from "../../utils/jwt";
import sendResponse from "../../utils/sendResponse";
import { tenantStorage } from "../../utils/tenantContext";
import { Company } from "../company/company.model";
import { hasFeature } from "../subscription/planFeature";
import { packageRequestSchema } from "./packageRequest";
import { otpRequestSchema, otpVerifySchema, portalCommentSchema, portalTicketSchema, PortalService } from "./portal.service";

/** Customer portal session (Bearer token from /portal/:slug/verify). Runs inside the ISP's tenant context. */
export const portalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) throw new AppError(401, "Please log in");
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new AppError(401, "Your session has expired. Please log in again.");
  }
  if (payload.scope !== "customer" || !payload.company) throw new AppError(403, "Customer portal access only");
  const company = await Company.findById(payload.company).select("status deletedAt");
  if (!company || company.deletedAt || company.status === "archived") throw new AppError(403, "This ISP is no longer available");
  if (!(await hasFeature(company._id, "customer_portal"))) throw new AppError(403, "The customer portal is turned off for this ISP");
  req.portal = { phone: payload.sub, company: company.id };
  tenantStorage.run({ companyId: company.id }, () => next());
};

const otpLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { success: false, message: "Too many attempts. Please try again in 15 minutes." },
});

const router = Router();
const session = (req: Request) => req.portal!;

/* ── logged in (declared first so "/me" is not taken as a slug) ── */
router.get("/me", portalAuth, async (req: Request, res: Response) => {
  sendResponse(res, { message: "My account", data: await PortalService.me(session(req)) });
});

router.get("/accounts/:id/payments", portalAuth, async (req: Request, res: Response) => {
  sendResponse(res, { message: "Payments", data: await PortalService.payments(session(req), String(req.params.id)) });
});

router.get("/accounts/:id/live", portalAuth, async (req: Request, res: Response) => {
  sendResponse(res, { message: "Live status", data: await PortalService.live(session(req), String(req.params.id)) });
});

router.get("/accounts/:id/packages", portalAuth, async (req: Request, res: Response) => {
  sendResponse(res, { message: "Packages", data: await PortalService.packages(session(req), String(req.params.id)) });
});

router.post("/accounts/:id/package-request", portalAuth, validateBody(packageRequestSchema), async (req: Request, res: Response) => {
  const r = await PortalService.requestPackageChange(session(req), String(req.params.id), req.body);
  sendResponse(res, { statusCode: 201, message: "Request sent. The ISP will confirm the change.", data: r });
});

router.get("/package-requests", portalAuth, async (req: Request, res: Response) => {
  sendResponse(res, { message: "Pending requests", data: await PortalService.pendingRequests(session(req)) });
});

router.get("/tickets", portalAuth, async (req: Request, res: Response) => {
  sendResponse(res, { message: "My complaints", data: await PortalService.listTickets(session(req)) });
});

router.post("/tickets", portalAuth, validateBody(portalTicketSchema), async (req: Request, res: Response) => {
  const t = await PortalService.createTicket(session(req), req.body);
  sendResponse(res, { statusCode: 201, message: `Complaint ${t.ticketNo} submitted. The ISP has been notified.`, data: t });
});

router.get("/tickets/:id", portalAuth, async (req: Request, res: Response) => {
  sendResponse(res, { message: "Complaint", data: await PortalService.getTicket(session(req), String(req.params.id)) });
});

router.post("/tickets/:id/comments", portalAuth, validateBody(portalCommentSchema), async (req: Request, res: Response) => {
  sendResponse(res, { statusCode: 201, message: "Message sent", data: await PortalService.commentTicket(session(req), String(req.params.id), req.body.text) });
});

/* ── public: ISP info and OTP login ── */
router.get("/isp/:slug", async (req: Request, res: Response) => {
  sendResponse(res, { message: "ISP", data: await PortalService.info(String(req.params.slug)) });
});

router.post("/isp/:slug/otp", otpLimiter, validateBody(otpRequestSchema), async (req: Request, res: Response) => {
  const r = await PortalService.requestOtp(String(req.params.slug), req.body.phone);
  sendResponse(res, { message: r.message, data: { sentTo: r.sentTo } });
});

router.post("/isp/:slug/verify", otpLimiter, validateBody(otpVerifySchema), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Logged in", data: await PortalService.verifyOtp(String(req.params.slug), req.body.phone, req.body.code) });
});

export default router;
