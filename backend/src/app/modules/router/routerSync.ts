import { Request, Response, Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { withRouter } from "../../services/mikrotik/mikrotik.service";
import sendResponse from "../../utils/sendResponse";
import { objectId } from "../../utils/zod";
import { audit } from "../activityLog/activityLog.service";
import { Customer } from "../customer/customer.model";
import { CustomerService } from "../customer/customer.service";
import { isConnectionEnabled } from "../customer/customer.sync";
import { Package } from "../package/package.model";
import { MikrotikRouter } from "./router.model";

/**
 * DB ↔ MikroTik check for one router: what the software thinks vs what the router has.
 * Problems are fixed by pushing the DB state to the router (the DB is the source of truth);
 * secrets that exist only on the router can be imported from Customers → Import.
 */
async function report(routerId: string) {
  if (!isValidObjectId(routerId)) throw new AppError(400, "Invalid router id");
  const router = await MikrotikRouter.findById(routerId).select("+password");
  if (!router) throw new AppError(404, "Router not found");
  const [customers, packages] = await Promise.all([
    Customer.find({ router: router._id, deletedAt: null, status: { $ne: "left" }, connectionType: "pppoe" }).select("name customerId pppoe.username status package"),
    Package.find({ router: router._id }).select("mikrotikProfile"),
  ]);
  const profileOf = new Map(packages.map((p) => [p.id, p.mikrotikProfile]));
  const secrets = await withRouter(router, (d) => d.listSecrets());
  const byName = new Map(secrets.map((s) => [s.name, s]));
  const known = new Set(customers.map((c) => c.pppoe.username));

  const issues: { customer?: { _id: string; name: string; customerId: string }; username: string; problem: "missing_on_router" | "should_be_disabled" | "should_be_enabled" | "wrong_profile" | "only_on_router"; detail?: string }[] = [];
  for (const c of customers) {
    const s = byName.get(c.pppoe.username);
    const ref = { _id: c.id, name: c.name, customerId: c.customerId };
    if (!s) {
      issues.push({ customer: ref, username: c.pppoe.username, problem: "missing_on_router" });
      continue;
    }
    const enabled = isConnectionEnabled(c.status);
    if (enabled && s.disabled) issues.push({ customer: ref, username: s.name, problem: "should_be_enabled", detail: `status ${c.status}, disabled on router` });
    if (!enabled && !s.disabled) issues.push({ customer: ref, username: s.name, problem: "should_be_disabled", detail: `status ${c.status}, still enabled on router` });
    const want = profileOf.get(String(c.package));
    if (want && s.profile !== want) issues.push({ customer: ref, username: s.name, problem: "wrong_profile", detail: `router has "${s.profile}", package needs "${want}"` });
  }
  for (const s of secrets) if (!known.has(s.name)) issues.push({ username: s.name, problem: "only_on_router", detail: `profile ${s.profile}${s.disabled ? ", disabled" : ""}` });

  const count = (p: string) => issues.filter((i) => i.problem === p).length;
  return {
    router: { _id: router.id, name: router.name },
    checkedAt: new Date(),
    customersInDb: customers.length,
    secretsOnRouter: secrets.length,
    summary: {
      missingOnRouter: count("missing_on_router"),
      shouldBeDisabled: count("should_be_disabled"),
      shouldBeEnabled: count("should_be_enabled"),
      wrongProfile: count("wrong_profile"),
      onlyOnRouter: count("only_on_router"),
    },
    issues,
  };
}

export const routerSyncRoutes = Router();
routerSyncRoutes.use(auth(), requireWritableTenant);

routerSyncRoutes.get("/:id/sync-report", authorize("router.view"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Sync report", data: await report(String(req.params.id)) });
});

/** Push the DB state for the selected customers (or every customer with a problem). */
routerSyncRoutes.post(
  "/:id/sync-fix",
  authorize("router.manage"),
  validateBody(z.object({ customers: z.array(objectId).max(1000).optional() })),
  audit("router.sync_fix", "router"),
  async (req: Request, res: Response) => {
    const r = await report(String(req.params.id));
    const ids = req.body.customers ?? [...new Set(r.issues.filter((i) => i.customer).map((i) => i.customer!._id))];
    const actor = { id: req.user!.id, role: req.user!.role, company: req.user!.company, zones: req.user!.zones, reseller: req.user!.reseller };
    let fixed = 0;
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      const { sync } = await CustomerService.resync(actor, id);
      if (sync.ok) fixed += 1;
      else failed.push({ id, error: sync.error });
    }
    res.locals.auditSummary = `Sync fix on ${r.router.name}: ${fixed} fixed, ${failed.length} failed`;
    sendResponse(res, { message: `${fixed} customer(s) pushed to the router${failed.length ? `, ${failed.length} failed` : ""}`, data: { fixed, failed } });
  },
);
