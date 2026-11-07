import { Request, Response, Router } from "express";
import mongoose from "mongoose";
import { auth, authorize } from "../../middlewares/auth";
import { startOfDhakaDay, startOfDhakaMonth } from "../../utils/date";
import { addDays } from "../../utils/duration";
import sendResponse from "../../utils/sendResponse";
import { Customer } from "../customer/customer.model";
import { Actor, customerScope } from "../customer/customer.service";
import { Payment } from "../payment/payment.model";
import { MikrotikRouter } from "../router/router.model";
import { Company } from "../company/company.model";
import { Package } from "../package/package.model";
import { GatewayConfig } from "../paymentGateway/gatewayConfig.model";

/** customerScope() for aggregate(), which does not cast strings to ObjectIds. */
function aggregateScope(actor: Actor) {
  const scope = customerScope(actor);
  const zone = scope.zone as { $in: string[] } | undefined;
  const out: Record<string, unknown> = zone ? { ...scope, zone: { $in: zone.$in.map((z) => new mongoose.Types.ObjectId(z)) } } : { ...scope };
  // a reseller's id is a string too — without this their dashboard counted 0 customers
  if (typeof out.reseller === "string") out.reseller = new mongoose.Types.ObjectId(out.reseller);
  return out;
}

/** Daily collection for the last 14 Dhaka days (zero-filled), for the dashboard chart. */
async function collectionTrend(payFilter: Record<string, unknown>, now: Date) {
  const from = addDays(startOfDhakaDay(now), -13);
  const rows = await Payment.aggregate<{ _id: string; amount: number; count: number }>([
    { $match: { ...payFilter, createdAt: { $gte: from } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Dhaka" } }, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  const byDay = new Map(rows.map((r) => [r._id, r]));
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(addDays(from, i).getTime() + 6 * 3600_000).toISOString().slice(0, 10);
    return { date: d, amount: byDay.get(d)?.amount ?? 0, count: byDay.get(d)?.count ?? 0 };
  });
}

async function summary(actor: Actor) {
  const now = new Date();
  const scope = customerScope(actor);
  const payFilter: Record<string, unknown> = { status: "success" };
  if (actor.role === "collector") payFilter.receivedBy = new mongoose.Types.ObjectId(actor.id);

  const sumSince = async (since: Date) => {
    const [r] = await Payment.aggregate<{ amount: number; count: number }>([
      { $match: { ...payFilter, createdAt: { $gte: since } } },
      { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    return { amount: r?.amount ?? 0, count: r?.count ?? 0 };
  };

  const [byStatus, dueAgg, expiringToday, expiring3Days, today, month, routers, recentPayments] = await Promise.all([
    Customer.aggregate<{ _id: string; count: number }>([
      { $match: aggregateScope(actor) },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Customer.aggregate<{ total: number }>([
      { $match: aggregateScope(actor) },
      { $group: { _id: null, total: { $sum: "$dueAmount" } } },
    ]),
    Customer.countDocuments({
      ...scope,
      status: "active",
      expiryDate: { $gte: now, $lt: addDays(startOfDhakaDay(now), 1) },
    }),
    Customer.countDocuments({ ...scope, status: "active", expiryDate: { $gte: now, $lte: addDays(now, 3) } }),
    sumSince(startOfDhakaDay(now)),
    sumSince(startOfDhakaMonth(now)),
    MikrotikRouter.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Payment.find(payFilter)
      .sort("-createdAt")
      .limit(5)
      .populate({ path: "customer", select: "name customerId" })
      .populate({ path: "receivedBy", select: "name" }),
  ]);

  const customers = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  return {
    customers: {
      total: byStatus.reduce((n, s) => n + s.count, 0),
      active: customers.active ?? 0,
      expired: customers.expired ?? 0,
      disabled: customers.disabled ?? 0,
      free: customers.free ?? 0,
    },
    totalDue: dueAgg[0]?.total ?? 0,
    expiringToday,
    expiring3Days,
    collection: { today, month },
    routers: Object.fromEntries(routers.map((r) => [r._id, r.count])),
    recentPayments,
    trend: await collectionTrend(payFilter, now),
    onboarding: await onboarding(actor.company),
  };
}

/** First-run checklist — each step is done once the ISP has configured it. */
async function onboarding(companyId: string) {
  const [company, routerCount, packageCount, customerCount, gatewayCount] = await Promise.all([
    Company.findById(companyId).select("address btrcLicenseNo"),
    MikrotikRouter.countDocuments(),
    Package.countDocuments(),
    Customer.countDocuments({ deletedAt: null }),
    GatewayConfig.countDocuments({ company: new mongoose.Types.ObjectId(companyId), enabled: true }),
  ]);
  const steps = [
    { key: "profile", label: "Complete your company profile (address, BTRC licence)", href: "/dashboard/settings", done: Boolean(company?.address) },
    { key: "router", label: "Connect your MikroTik router", href: "/dashboard/routers", done: routerCount > 0 },
    { key: "package", label: "Create internet packages", href: "/dashboard/packages", done: packageCount > 0 },
    { key: "customers", label: "Add or import your customers", href: "/dashboard/customers/import", done: customerCount > 0 },
    { key: "payments", label: "Turn on online bill payment for customers", href: "/dashboard/settings/payments", done: gatewayCount > 0 },
  ];
  return { steps, completed: steps.filter((s) => s.done).length, total: steps.length };
}

const router = Router();
router.get("/", auth(), authorize("dashboard.view"), async (req: Request, res: Response) => {
  const data = await summary({
    id: req.user!.id,
    role: req.user!.role,
    company: req.user!.company,
    zones: req.user!.zones,
    reseller: req.user!.reseller,
  });
  sendResponse(res, { message: "Dashboard", data });
});

export default router;
