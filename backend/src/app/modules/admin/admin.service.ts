import { Types } from "mongoose";
import { z } from "zod";
import { COMPANY_STATUSES } from "../../constants/roles";
import AppError from "../../errors/AppError";
import { addDays } from "../../utils/duration";
import { paginate } from "../../utils/paginate";
import { objectId, optionalText } from "../../utils/zod";
import { SubscriptionInvoice } from "../billing/billing.model";
import { Company, ICompany } from "../company/company.model";
import { Customer } from "../customer/customer.model";
import { notifyRoles } from "../notification/notification.service";
import { PaymentAttempt } from "../onlinePayment/paymentAttempt.model";
import { PLAN_FEATURES, Plan } from "../plan/plan.model";
import { PlatformUser } from "../platformUser/platformUser.model";
import { Subscription } from "../subscription/subscription.model";
import { User } from "../user/user.model";
import { runWithTenant } from "../../utils/tenantContext";
import { PlatformAuditLog } from "./platformAudit";

const oid = (id: string) => new Types.ObjectId(id);

/* ───────────── Metrics ───────────── */

/**
 * MRR = monthly value of active paid subscriptions (yearly ÷ 12), in BDT list prices.
 * Revenue = money actually received (successful platform payments) by currency.
 */
async function metrics() {
  const now = new Date();
  const d30 = addDays(now, -30);
  const [byStatus, activeSubs, signups30, trialsEnding, endCustomers, revenue30, revenueAll, pendingManual, recent] = await Promise.all([
    Company.aggregate<{ _id: string; count: number }>([{ $match: { deletedAt: null } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Subscription.find({ status: { $in: ["active", "past_due"] } }).populate<{ plan: { priceBDT: { monthly: number; yearly: number }; name: string } }>("plan", "name priceBDT"),
    Company.countDocuments({ createdAt: { $gte: d30 } }),
    Company.countDocuments({ status: "trial", trialEndsAt: { $gte: now, $lte: addDays(now, 7) } }),
    Customer.countDocuments({ deletedAt: null }),
    PaymentAttempt.aggregate<{ _id: { scope: string; currency: string }; amount: number }>([
      { $match: { status: "success", scope: { $ne: "customer_bill" }, completedAt: { $gte: d30 } } },
      { $group: { _id: { scope: "$scope", currency: "$currency" }, amount: { $sum: "$amount" } } },
    ]),
    PaymentAttempt.aggregate<{ _id: string; amount: number }>([
      { $match: { status: "success", scope: { $ne: "customer_bill" } } },
      { $group: { _id: "$currency", amount: { $sum: "$amount" } } },
    ]),
    PaymentAttempt.countDocuments({ status: "pending_review", scope: { $ne: "customer_bill" } }),
    Company.find({ deletedAt: null }).sort("-createdAt").limit(8).select("name slug status createdAt usage"),
  ]);

  let mrr = 0;
  const byPlan: Record<string, number> = {};
  for (const s of activeSubs) {
    if (!s.plan) continue;
    const monthly = s.interval === "yearly" ? s.plan.priceBDT.yearly / 12 : s.plan.priceBDT.monthly;
    mrr += monthly;
    byPlan[s.plan.name] = (byPlan[s.plan.name] ?? 0) + 1;
  }
  const statuses = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  return {
    tenants: {
      total: byStatus.reduce((n, s) => n + s.count, 0),
      ...Object.fromEntries(COMPANY_STATUSES.map((st) => [st, statuses[st] ?? 0])),
      signups30,
      trialsEnding7: trialsEnding,
    },
    mrrBDT: Math.round(mrr),
    arrBDT: Math.round(mrr * 12),
    paidByPlan: byPlan,
    endCustomers,
    revenue30: revenue30.map((r) => ({ scope: r._id.scope, currency: r._id.currency, amount: r.amount })),
    revenueAllTime: Object.fromEntries(revenueAll.map((r) => [r._id, r.amount])),
    pendingManual,
    recentSignups: recent,
  };
}

/* ───────────── Tenants ───────────── */

async function listTenants(query: Record<string, unknown>) {
  const filter: Record<string, unknown> = { deletedAt: null };
  const result = await paginate<ICompany>(Company, filter, query, {
    searchFields: ["name", "slug", "email", "phone"],
    filterFields: ["status"],
    select: "name slug email phone status trialEndsAt usage smsBalance createdAt",
  });
  const subs = await Subscription.find({ company: { $in: result.data.map((c) => (c as unknown as { _id: Types.ObjectId })._id) } }).populate("plan", "name");
  const byCompany = new Map(subs.map((s) => [String(s.company), s]));
  return {
    ...result,
    data: result.data.map((c) => {
      const s = byCompany.get(String((c as unknown as { _id: Types.ObjectId })._id));
      return {
        ...c,
        subscription: s
          ? { plan: (s.plan as unknown as { name?: string })?.name, status: s.status, interval: s.interval, currentPeriodEnd: s.currentPeriodEnd }
          : null,
      };
    }),
  };
}

async function tenantDetail(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, "Invalid company id");
  const company = await Company.findById(id);
  if (!company) throw new AppError(404, "Company not found");
  const [owner, subscription, staff, customers, invoices, payments, audit] = await Promise.all([
    User.findById(company.owner).select("name phone email lastLogin isActive"),
    Subscription.findOne({ company: id }).populate("plan", "name slug limits priceBDT"),
    User.countDocuments({ company: id, isActive: true }),
    Customer.aggregate<{ _id: string; count: number }>([{ $match: { company: oid(id), deletedAt: null } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    SubscriptionInvoice.find({ company: id }).sort("-createdAt").limit(20),
    PaymentAttempt.find({ company: id, scope: { $ne: "customer_bill" } }).sort("-createdAt").limit(20).select("description amount currency gateway status gatewayTrxId createdAt"),
    PlatformAuditLog.find({ company: id }).sort("-createdAt").limit(20).populate("platformUser", "name"),
  ]);
  return {
    company,
    owner,
    subscription,
    staff,
    customers: Object.fromEntries(customers.map((c) => [c._id, c.count])),
    invoices,
    payments,
    audit,
  };
}

export const tenantStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
  reason: optionalText(300),
});

async function setTenantStatus(id: string, input: z.infer<typeof tenantStatusSchema>) {
  const company = await Company.findById(id);
  if (!company) throw new AppError(404, "Company not found");
  if (company.status === "archived") throw new AppError(400, "Archived companies cannot be changed");
  company.status = input.status;
  await company.save();
  await runWithTenant(id, () =>
    notifyRoles(id, ["owner"], {
      title: input.status === "suspended" ? "Your account has been suspended by the platform" : "Your account has been re-activated",
      body: input.reason,
      link: "/dashboard/billing/subscription",
    }),
  );
  return company;
}

export const extendTrialSchema = z.object({ days: z.coerce.number().int().min(1).max(90) });

async function extendTrial(id: string, days: number) {
  const company = await Company.findById(id);
  if (!company) throw new AppError(404, "Company not found");
  const sub = await Subscription.findOne({ company: id });
  if (sub?.status === "active") throw new AppError(400, "This ISP already has a paid plan");
  const base = company.trialEndsAt && company.trialEndsAt > new Date() ? company.trialEndsAt : new Date();
  company.trialEndsAt = addDays(base, days);
  company.status = "trial";
  await company.save();
  await Subscription.updateOne({ company: id }, { $set: { status: "trialing", currentPeriodEnd: company.trialEndsAt } });
  return company;
}

export const assignPlanSchema = z.object({
  plan: objectId,
  interval: z.enum(["monthly", "yearly"]),
  /** paid-until date (custom/enterprise deals, offline payments) */
  periodEnd: z.coerce.date(),
  note: optionalText(300),
});

/** Manually put an ISP on a plan (offline payment, enterprise contract, compensation). */
async function assignPlan(id: string, input: z.infer<typeof assignPlanSchema>) {
  const [company, plan] = await Promise.all([Company.findById(id), Plan.findById(input.plan)]);
  if (!company) throw new AppError(404, "Company not found");
  if (!plan) throw new AppError(404, "Plan not found");
  if (input.periodEnd <= new Date()) throw new AppError(400, "Paid-until date must be in the future");
  await Subscription.updateOne(
    { company: id },
    {
      $set: {
        plan: plan._id,
        interval: input.interval,
        gateway: "manual",
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: input.periodEnd,
        cancelAtPeriodEnd: false,
      },
    },
    { upsert: true },
  );
  company.status = "active";
  await company.save();
  return { company, plan: plan.name, periodEnd: input.periodEnd };
}

/* ───────────── Plans ───────────── */

const price = z.object({ monthly: z.coerce.number().min(0), yearly: z.coerce.number().min(0) });
const limit = z.coerce.number().int().min(-1);

// No .default() here: zod keeps defaults inside .partial(), which would reset fields on PATCH.
const planFields = {
  name: z.string().trim().min(2).max(50),
  description: optionalText(300),
  priceBDT: price,
  priceUSD: price,
  limits: z.object({ customers: limit, routers: limit, staff: limit, resellers: limit.optional() }),
  features: z.array(z.enum(PLAN_FEATURES)),
  isPublic: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int(),
};

export const planSchema = z.object({
  ...planFields,
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,30}$/),
  features: planFields.features.default([]),
  isPublic: planFields.isPublic.default(true),
  isActive: planFields.isActive.default(true),
  sortOrder: planFields.sortOrder.default(10),
});

export const planUpdateSchema = z.object(planFields).partial();

async function listPlans() {
  const [plans, counts] = await Promise.all([
    Plan.find().sort("sortOrder"),
    Subscription.aggregate<{ _id: Types.ObjectId; count: number }>([{ $group: { _id: "$plan", count: { $sum: 1 } } }]),
  ]);
  const byPlan = new Map(counts.map((c) => [String(c._id), c.count]));
  return plans.map((p) => ({ ...p.toJSON(), subscribers: byPlan.get(p.id) ?? 0 }));
}

async function updatePlan(id: string, input: z.infer<typeof planUpdateSchema>) {
  const plan = await Plan.findById(id);
  if (!plan) throw new AppError(404, "Plan not found");
  if (plan.isTrial && input.isPublic) throw new AppError(400, "The trial plan cannot be public");
  plan.set(input);
  return plan.save();
}

/* ───────────── Platform staff ───────────── */

export const platformUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().trim().toLowerCase(),
  role: z.enum(["super_admin", "support", "finance"]),
  password: z.string().min(10, "At least 10 characters"),
});

export const platformUserUpdateSchema = z
  .object({ name: z.string().trim().min(2).max(100), role: z.enum(["super_admin", "support", "finance"]), isActive: z.boolean(), password: z.string().min(10) })
  .partial();

async function updatePlatformUser(actorId: string, id: string, input: z.infer<typeof platformUserUpdateSchema>) {
  const user = await PlatformUser.findById(id);
  if (!user) throw new AppError(404, "Admin not found");
  if (id === actorId && (input.isActive === false || (input.role && input.role !== "super_admin"))) {
    throw new AppError(400, "You cannot demote or deactivate yourself");
  }
  user.set(input);
  if (input.password || input.isActive === false || input.role) user.tokenVersion += 1;
  await user.save();
  return user;
}

export const AdminService = {
  metrics,
  listTenants,
  tenantDetail,
  setTenantStatus,
  extendTrial,
  assignPlan,
  listPlans,
  updatePlan,
  updatePlatformUser,
};
