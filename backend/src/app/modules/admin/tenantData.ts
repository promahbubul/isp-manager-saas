import { Response } from "express";
import mongoose, { Model, Types } from "mongoose";
import AppError from "../../errors/AppError";
import { Company } from "../company/company.model";
import { Subscription } from "../subscription/subscription.model";
import { User } from "../user/user.model";

/**
 * Collections that hold a company's data, found from the registered Mongoose models
 * (anything with a `company` path), so new modules are covered automatically.
 */

/** Never exported: secrets/one-time codes. Kept on delete: platform's own records. */
const NOT_EXPORTED = new Set(["Otp", "PasswordReset", "GatewayConfig", "Counter"]);
const KEPT_ON_DELETE = new Set(["SubscriptionInvoice", "PlatformAuditLog", "SmsCreditTransaction", "Company"]);

function tenantModels(): Model<unknown>[] {
  return mongoose
    .modelNames()
    .map((n) => mongoose.model(n) as Model<unknown>)
    .filter((m) => m.modelName !== "Company" && m.schema.path("company"));
}

const oid = (id: string) => new Types.ObjectId(id);

async function loadCompany(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, "Invalid company id");
  const company = await Company.findById(id);
  if (!company || company.deletedAt) throw new AppError(404, "Company not found");
  return company;
}

/**
 * Streams a JSON export: { exportedAt, company, collections: { Customer: [...], ... } }.
 * select:false fields (passwords, router credentials, gateway keys) are left out.
 * Streaming keeps memory flat for ISPs with tens of thousands of customers.
 */
export async function streamTenantExport(companyId: string, res: Response) {
  const company = await loadCompany(companyId);
  const models = tenantModels().filter((m) => !NOT_EXPORTED.has(m.modelName));
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${company.slug}-export-${date}.json"`);

  res.write(`{"exportedAt":${JSON.stringify(new Date())},"company":${JSON.stringify(company.toJSON())},"collections":{`);
  let firstModel = true;
  for (const m of models) {
    const filter = { company: oid(companyId) };
    res.write(`${firstModel ? "" : ","}${JSON.stringify(m.modelName)}:[`);
    firstModel = false;
    // Keyset batches by _id (regular find, so schema select:false still hides secrets).
    let first = true;
    let lastId: Types.ObjectId | undefined;
    for (;;) {
      const batch = await m
        .find(lastId ? { ...filter, _id: { $gt: lastId } } : filter)
        .sort({ _id: 1 })
        .limit(500)
        .lean<{ _id: Types.ObjectId }[]>();
      for (const doc of batch) {
        if (!res.write(`${first ? "" : ","}${JSON.stringify(doc)}`)) await new Promise((r) => res.once("drain", r));
        first = false;
      }
      if (batch.length < 500) break;
      lastId = batch[batch.length - 1]._id;
    }
    res.write("]");
  }
  res.end("}}");
}

/** Archive: sign everyone out and freeze the account. Data stays; jobs and logins skip it. */
export async function archiveTenant(companyId: string) {
  const company = await loadCompany(companyId);
  if (company.status === "archived") throw new AppError(400, "Already archived");
  company.status = "archived";
  await company.save();
  await User.updateMany({ company: company._id }, { $inc: { tokenVersion: 1 } });
  return company;
}

/** Restore from archive to whatever the subscription says. */
export async function restoreTenant(companyId: string) {
  const company = await loadCompany(companyId);
  if (company.status !== "archived") throw new AppError(400, "Only archived companies can be restored");
  const sub = await Subscription.findOne({ company: company._id });
  const now = new Date();
  if (sub?.status === "active" && sub.currentPeriodEnd && sub.currentPeriodEnd > now) company.status = "active";
  else if (sub?.status === "trialing" && company.trialEndsAt && company.trialEndsAt > now) company.status = "trial";
  else company.status = "suspended"; // must pay to continue
  await company.save();
  return company;
}

/**
 * Permanent delete of an archived ISP. Removes every tenant collection except the
 * platform's own financial/audit records, then tombstones the company (slug freed).
 */
export async function deleteTenant(companyId: string, confirmSlug: string) {
  const company = await loadCompany(companyId);
  if (company.status !== "archived") throw new AppError(400, "Archive the company first");
  if (confirmSlug.trim().toLowerCase() !== company.slug) throw new AppError(400, "Type the company slug exactly to confirm");

  const removed: Record<string, number> = {};
  for (const m of tenantModels()) {
    if (KEPT_ON_DELETE.has(m.modelName)) continue;
    const filter: Record<string, unknown> = { company: oid(companyId) };
    // Platform payments (subscription, SMS) are accounting records — keep them.
    if (m.modelName === "PaymentAttempt") filter.scope = "customer_bill";
    const r = await m.deleteMany(filter);
    if (r.deletedCount) removed[m.modelName] = r.deletedCount;
  }

  const originalSlug = company.slug;
  company.set({
    slug: `${company.slug}--deleted-${Date.now().toString(36)}`,
    deletedAt: new Date(),
    email: `deleted+${company.id}@invalid`,
    phone: "deleted",
    address: undefined,
    customDomain: undefined,
    owner: undefined,
    usage: { customers: 0, routers: 0, staff: 0 },
  });
  await company.save();
  return { name: company.name, slug: originalSlug, removed };
}
