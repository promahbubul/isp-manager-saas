import { Query, Schema, Types } from "mongoose";
import { getTenantId } from "../utils/tenantContext";

const QUERY_HOOKS = [
  "find",
  "findOne",
  "countDocuments",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "replaceOne",
  "distinct",
] as const;

/**
 * Multi-tenant isolation.
 * - Adds a required, indexed `company` field.
 * - While a tenant context is active (set by the auth middleware), every query is
 *   forced to that company and new documents get it automatically.
 * - Outside a tenant context (signup, login, jobs, super admin) queries are
 *   unscoped, so those code paths must set `company` explicitly.
 */
export function tenantPlugin(schema: Schema, opts: { index?: boolean } = {}) {
  // Pass { index: false } when the schema declares its own unique index on { company: 1 }.
  schema.add({
    company: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: opts.index ?? true },
  });

  for (const hook of QUERY_HOOKS) {
    schema.pre(hook, function (this: Query<unknown, unknown>) {
      const companyId = getTenantId();
      // Always overwrite, so a request can never reach another company's data.
      if (companyId) this.where({ company: companyId });
    });
  }

  // validate runs before save, so the company must be filled in here.
  schema.pre("validate", function () {
    const companyId = getTenantId();
    if (companyId && this.isNew && !this.get("company")) this.set("company", companyId);
  });

  schema.pre("save", function () {
    const companyId = getTenantId();
    if (!companyId) return;
    if (String(this.get("company")) !== companyId) {
      throw new Error("Tenant mismatch: cannot save a document for another company");
    }
  });

  schema.pre("insertMany", function (docs: unknown) {
    const companyId = getTenantId();
    if (!companyId) return;
    const list = (Array.isArray(docs) ? docs : [docs]) as Record<string, unknown>[];
    for (const doc of list) doc.company = companyId;
  });

  schema.pre("aggregate", function () {
    const companyId = getTenantId();
    if (companyId) this.pipeline().unshift({ $match: { company: new Types.ObjectId(companyId) } });
  });
}
