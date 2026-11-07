import crypto from "node:crypto";
import dns from "node:dns/promises";
import { Request, Response, Router } from "express";
import { z } from "zod";
import config from "../../config";
import AppError from "../../errors/AppError";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { audit } from "../activityLog/activityLog.service";
import { hasFeature, requireFeature } from "../subscription/planFeature";
import { Company } from "./company.model";

/**
 * Customer portal on the ISP's own domain (plan feature custom_domain), e.g.
 * my.speednet.com.bd. Ownership is proved with a TXT record before it goes live.
 */
const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, "Enter a domain like my.speednet.com.bd");

const platformHosts = () =>
  [config.appUrl, config.apiPublicUrl].map((u) => {
    try {
      return new URL(u).hostname;
    } catch {
      return "";
    }
  });

export const verifyRecordName = (domain: string) => `_isp-manager.${domain}`;

export const customDomainRoutes = Router();
customDomainRoutes.use(auth(), requireWritableTenant, authorize("setting.manage"), requireFeature("custom_domain"));

customDomainRoutes.get("/", async (req: Request, res: Response) => {
  const c = await Company.findById(req.user!.company).select("customDomain customDomainVerified customDomainToken");
  sendResponse(res, {
    message: "Custom domain",
    data: c?.customDomain
      ? { domain: c.customDomain, verified: Boolean(c.customDomainVerified), txtName: verifyRecordName(c.customDomain), txtValue: c.customDomainToken, cnameTarget: new URL(config.appUrl).hostname }
      : null,
  });
});

customDomainRoutes.put("/", validateBody(z.object({ domain: hostname })), audit("setting.custom_domain", "setting"), async (req: Request, res: Response) => {
  const domain = req.body.domain as string;
  if (platformHosts().some((h) => h && (domain === h || domain.endsWith(`.${h}`)))) throw new AppError(400, "Use your own domain, not the platform's");
  if (await Company.exists({ customDomain: domain, _id: { $ne: req.user!.company } })) throw new AppError(409, "This domain is used by another ISP");
  const token = `verify-${crypto.randomBytes(12).toString("hex")}`;
  await Company.updateOne({ _id: req.user!.company }, { customDomain: domain, customDomainVerified: false, customDomainToken: token });
  sendResponse(res, {
    message: "Add the DNS records, then press Verify",
    data: { domain, verified: false, txtName: verifyRecordName(domain), txtValue: token, cnameTarget: new URL(config.appUrl).hostname },
  });
});

customDomainRoutes.post("/verify", audit("setting.custom_domain_verify", "setting"), async (req: Request, res: Response) => {
  const c = await Company.findById(req.user!.company).select("customDomain customDomainToken");
  if (!c?.customDomain || !c.customDomainToken) throw new AppError(400, "Set a domain first");
  let records: string[][] = [];
  try {
    records = await dns.resolveTxt(verifyRecordName(c.customDomain));
  } catch {
    /* not found yet */
  }
  const ok = records.some((r) => r.join("") === c.customDomainToken);
  if (!ok) throw new AppError(400, `TXT record ${verifyRecordName(c.customDomain)} = ${c.customDomainToken} not found yet. DNS can take up to an hour.`);
  await Company.updateOne({ _id: c._id }, { customDomainVerified: true });
  sendResponse(res, { message: `${c.customDomain} verified. Point it to the platform with a CNAME and it will open your portal.`, data: { domain: c.customDomain, verified: true } });
});

customDomainRoutes.delete("/", audit("setting.custom_domain_remove", "setting"), async (req: Request, res: Response) => {
  await Company.updateOne({ _id: req.user!.company }, { $unset: { customDomain: 1, customDomainVerified: 1, customDomainToken: 1 } });
  sendResponse(res, { message: "Custom domain removed" });
});

/**
 * Public lookups:
 *  GET /public/domain/:host → { slug } for the frontend proxy (verified domains only)
 *  GET /public/domain-check?domain= → 200/404, for Caddy's on-demand TLS "ask" hook
 */
export const publicDomainRoutes = Router();

async function resolveDomain(host: string) {
  const c = await Company.findOne({ customDomain: host.toLowerCase(), customDomainVerified: true, deletedAt: null, status: { $ne: "archived" } }).select("slug");
  if (!c || !(await hasFeature(c._id, "custom_domain"))) return null;
  return c.slug;
}

publicDomainRoutes.get("/domain-check", async (req: Request, res: Response) => {
  const slug = typeof req.query.domain === "string" ? await resolveDomain(req.query.domain) : null;
  res.status(slug ? 200 : 404).end();
});

publicDomainRoutes.get("/domain/:host", async (req: Request, res: Response) => {
  const slug = await resolveDomain(String(req.params.host));
  if (!slug) throw new AppError(404, "Unknown domain");
  res.setHeader("Cache-Control", "public, max-age=300");
  sendResponse(res, { message: "Domain", data: { slug } });
});
