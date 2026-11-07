import crypto from "node:crypto";
import { NextFunction, Request, Response, Router } from "express";
import config from "../../config";
import AppError from "../../errors/AppError";
import { decrypt } from "../../utils/encryption";
import { runWithTenant } from "../../utils/tenantContext";
import { Company } from "../company/company.model";
import { Customer } from "../customer/customer.model";
import { isConnectionEnabled } from "../customer/customer.sync";
import { IpSession } from "../iplog/iplog.model";
import { Package } from "../package/package.model";
import { MikrotikRouter } from "../router/router.model";

/**
 * FreeRADIUS → this API (rlm_rest), for routers in "radius" auth mode.
 *   POST /radius/authorize  → Cleartext-Password + MikroTik rate limit, or reject
 *   POST /radius/accounting → Start / Interim-Update / Stop → BTRC IP log
 * FreeRADIUS runs on the same server and authenticates with RADIUS_API_SECRET.
 * See deploy/freeradius/ for the module and site files.
 */

/** rlm_rest "json" bodies look like {"User-Name":{"type":"string","value":["rahim"]}}; plain {"User-Name":"rahim"} also works. */
function attr(body: Record<string, unknown>, name: string): string | undefined {
  const v = body[name];
  if (v === undefined || v === null) return undefined;
  if (typeof v === "object" && v !== null && "value" in v) {
    const val = (v as { value: unknown }).value;
    return Array.isArray(val) ? String(val[0] ?? "") : String(val);
  }
  return String(v);
}

function requireSecret(req: Request, _res: Response, next: NextFunction) {
  const secret = config.radius.apiSecret;
  if (!secret) throw new AppError(503, "RADIUS is not enabled on this server (RADIUS_API_SECRET)");
  // X-Radius-Secret header, or HTTP Basic auth (FreeRADIUS 3 rlm_rest can only send basic auth)
  let given = String(req.headers["x-radius-secret"] ?? "");
  const basic = req.headers.authorization?.startsWith("Basic ") ? Buffer.from(req.headers.authorization.slice(6), "base64").toString() : "";
  if (!given && basic.includes(":")) given = basic.slice(basic.indexOf(":") + 1);
  const ok = given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) throw new AppError(401, "Bad RADIUS secret");
  next();
}

/** Which router (and so which ISP) is asking: by NAS-IP-Address, then NAS-Identifier "rt-<routerId>". */
async function findNas(body: Record<string, unknown>) {
  const ip = attr(body, "NAS-IP-Address");
  const ident = attr(body, "NAS-Identifier");
  const byId = ident?.startsWith("rt-") ? ident.slice(3) : undefined;
  const or: Record<string, unknown>[] = [];
  if (ip) or.push({ "radius.nasIp": ip }, { host: ip });
  if (byId && /^[0-9a-f]{24}$/.test(byId)) or.push({ _id: byId });
  if (!or.length) return null;
  return MikrotikRouter.findOne({ authMode: "radius", isActive: true, $or: or }).select("company name radius");
}

/** MikroTik rate limit "rx/tx" from the router's point of view = customer upload/download. */
const rateLimit = (pkg: { speedUp: number; speedDown: number }) => `${pkg.speedUp}M/${pkg.speedDown}M`;

export const radiusRoutes = Router();
radiusRoutes.use(requireSecret);

radiusRoutes.post("/authorize", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const username = attr(body, "User-Name");
  const nas = await findNas(body);
  // rlm_rest: 401 → Access-Reject, 404 → notfound (also a reject in our site config)
  if (!username || !nas) return res.status(404).json({ "reply:Reply-Message": "Unknown router or user" });

  const result = await runWithTenant(String(nas.company), async () => {
    const company = await Company.findById(nas.company).select("status trialEndsAt deletedAt");
    // A lapsed SaaS subscription must not cut the ISP's own customers off; only archived/deleted do.
    if (!company || company.deletedAt || company.status === "archived") return { code: 404 as const };
    const c = await Customer.findOne({ "pppoe.username": username, deletedAt: null, router: nas._id }).select("+pppoe.password status package connectionType");
    if (!c || c.connectionType !== "pppoe") return { code: 404 as const };
    const password = decrypt(c.pppoe.password);
    if (isConnectionEnabled(c.status)) {
      const pkg = await Package.findById(c.package).select("speedUp speedDown");
      return { code: 200 as const, body: { "control:Cleartext-Password": password, "reply:Mikrotik-Rate-Limit": pkg ? rateLimit(pkg) : undefined } };
    }
    // Expired/disabled: either a walled-garden pool (they can still reach the pay page) or reject.
    if (c.status === "expired" && nas.radius?.expiredPool) {
      return { code: 200 as const, body: { "control:Cleartext-Password": password, "reply:Framed-Pool": nas.radius.expiredPool, "reply:Mikrotik-Rate-Limit": "512k/512k" } };
    }
    return { code: 401 as const, body: { "reply:Reply-Message": c.status === "disabled" ? "Account disabled" : "Account expired, please pay your bill" } };
  });
  res.status(result.code).json(result.body ?? {});
});

/** Accounting feeds the BTRC IP log directly (more exact than polling the router). */
radiusRoutes.post("/accounting", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const nas = await findNas(body);
  if (!nas) return res.status(204).end();
  const type = attr(body, "Acct-Status-Type");
  const username = attr(body, "User-Name") ?? "";
  const sessionId = attr(body, "Acct-Session-Id") ?? "";
  const ip = attr(body, "Framed-IP-Address");
  const mac = attr(body, "Calling-Station-Id");
  const n = (k: string) => Number(attr(body, k) ?? 0);
  // octets are 32-bit counters; gigawords hold the overflow
  const bytesIn = n("Acct-Input-Gigawords") * 2 ** 32 + n("Acct-Input-Octets");
  const bytesOut = n("Acct-Output-Gigawords") * 2 ** 32 + n("Acct-Output-Octets");
  const now = new Date();

  await runWithTenant(String(nas.company), async () => {
    const existing = sessionId ? await IpSession.findOne({ router: nas._id, acctSessionId: sessionId }) : null;
    if (type === "Start" || (!existing && type === "Interim-Update")) {
      if (existing) return;
      const customer = await Customer.findOne({ "pppoe.username": username, deletedAt: null }).select("_id");
      const uptime = n("Acct-Session-Time");
      await IpSession.create({
        router: nas._id,
        customer: customer?._id,
        username,
        ip,
        mac,
        acctSessionId: sessionId,
        startedAt: new Date(now.getTime() - uptime * 1000),
        lastSeenAt: now,
        bytesIn,
        bytesOut,
      });
    } else if (existing) {
      existing.set({ lastSeenAt: now, bytesIn, bytesOut, ...(ip ? { ip } : {}) });
      if (type === "Stop") existing.endedAt = now;
      await existing.save();
    }
  });
  res.status(204).end();
});
