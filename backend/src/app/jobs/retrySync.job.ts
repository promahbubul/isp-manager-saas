import { Company } from "../modules/company/company.model";
import { Customer } from "../modules/customer/customer.model";
import { syncCustomer } from "../modules/customer/customer.sync";
import { runWithTenant } from "../utils/tenantContext";

const BATCH = 200;

/** Re-push customers whose last router sync failed (or never ran). */
export async function retryFailedSyncs(): Promise<{ attempted: number; fixed: number }> {
  let attempted = 0;
  let fixed = 0;
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000); // let in-flight requests finish first

  const companyIds = await Customer.distinct("company", {
    deletedAt: null,
    syncStatus: { $in: ["failed", "pending"] },
    updatedAt: { $lt: staleBefore },
  });

  for (const companyId of companyIds) {
    const company = await Company.findById(companyId).select("status");
    if (!company || company.status === "archived") continue;

    await runWithTenant(String(companyId), async () => {
      const customers = await Customer.find({
        deletedAt: null,
        syncStatus: { $in: ["failed", "pending"] },
        updatedAt: { $lt: staleBefore },
      })
        .select("+pppoe.password")
        .limit(BATCH);
      for (const c of customers) {
        attempted += 1;
        if ((await syncCustomer(c)).ok) fixed += 1;
      }
    });
  }
  return { attempted, fixed };
}
