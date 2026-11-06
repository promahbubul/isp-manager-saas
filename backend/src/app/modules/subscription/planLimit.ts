import { Types } from "mongoose";
import AppError from "../../errors/AppError";
import { Company } from "../company/company.model";
import { Plan } from "../plan/plan.model";
import { Subscription } from "./subscription.model";

export type LimitedResource = "customers" | "routers" | "staff";

/** Throws 403 when the company already uses its plan's quota for `resource`. -1 = unlimited. */
export async function assertPlanLimit(companyId: string | Types.ObjectId, resource: LimitedResource, adding = 1) {
  const [company, sub] = await Promise.all([
    Company.findById(companyId).select("usage"),
    Subscription.findOne({ company: companyId }).select("plan"),
  ]);
  if (!company || !sub) throw new AppError(403, "No active subscription");
  const plan = await Plan.findById(sub.plan).select("name limits");
  const limit = plan?.limits?.[resource] ?? 0;
  if (limit === -1) return;
  if (company.usage[resource] + adding > limit) {
    throw new AppError(
      403,
      `Your ${plan?.name ?? "current"} plan allows up to ${limit} ${resource}. Upgrade your plan to add more.`,
      { resource, limit, used: company.usage[resource] },
    );
  }
}

export const changeUsage = (companyId: string | Types.ObjectId, resource: LimitedResource, by: number) =>
  Company.updateOne({ _id: companyId }, { $inc: { [`usage.${resource}`]: by } });
