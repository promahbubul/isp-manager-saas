import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import AppError from "../../errors/AppError";
import { Plan, PlanFeature } from "../plan/plan.model";
import { Subscription } from "./subscription.model";

const FEATURE_NAMES: Record<PlanFeature, string> = {
  online_payment: "online payment",
  customer_portal: "the customer portal",
  ticket: "customer support tickets",
  reseller: "resellers",
  inventory: "inventory",
  ip_log: "the BTRC IP log",
  custom_domain: "a custom domain",
  own_sms_gateway: "your own SMS gateway",
  api_access: "API access",
  white_label: "white labelling",
};

export async function companyFeatures(companyId: string | Types.ObjectId): Promise<PlanFeature[]> {
  const sub = await Subscription.findOne({ company: companyId }).select("plan");
  if (!sub) return [];
  const plan = await Plan.findById(sub.plan).select("features");
  return plan?.features ?? [];
}

export async function hasFeature(companyId: string | Types.ObjectId, feature: PlanFeature) {
  return (await companyFeatures(companyId)).includes(feature);
}

export const featureLockedError = (feature: PlanFeature) =>
  new AppError(403, `Your plan does not include ${FEATURE_NAMES[feature]}. Upgrade from My Subscription to use it.`, { code: "feature_locked", feature });

/** Throws 403 `feature_locked` unless the company's current plan includes the feature. */
export async function assertFeature(companyId: string | Types.ObjectId, feature: PlanFeature) {
  if (!(await hasFeature(companyId, feature))) throw featureLockedError(feature);
}

/** Route guard; must run after auth(). */
export const requireFeature = (feature: PlanFeature) => async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) throw new AppError(401, "Authentication required");
  await assertFeature(req.user.company, feature);
  next();
};
