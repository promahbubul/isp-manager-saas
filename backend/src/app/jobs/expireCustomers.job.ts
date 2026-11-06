import { Types } from "mongoose";
import { Company } from "../modules/company/company.model";
import { Customer, CustomerDoc } from "../modules/customer/customer.model";
import { MikrotikRouter } from "../modules/router/router.model";
import { getSettings } from "../modules/setting/setting.model";
import { sendEventSms } from "../modules/sms/sms.service";
import { withRouter } from "../services/mikrotik/mikrotik.service";
import { addDays } from "../utils/duration";
import { runWithTenant } from "../utils/tenantContext";

export type ExpireResult = { companies: number; expired: number; routerFailures: number };

/**
 * Flow 9 (PLAN.md §11): disable prepaid customers whose validity + grace period ended.
 * Suspended/archived tenants are skipped so an unpaid SaaS bill never cuts off
 * the ISP's own customers. Router failures leave the customer `expired` with
 * syncStatus=failed; the retry job pushes the change later.
 */
export async function expireCustomers(now = new Date()): Promise<ExpireResult> {
  const result: ExpireResult = { companies: 0, expired: 0, routerFailures: 0 };
  const companies = await Company.find({ status: { $in: ["trial", "active", "past_due"] }, deletedAt: null }).select(
    "_id",
  );

  for (const company of companies) {
    await runWithTenant(company.id, async () => {
      const settings = await getSettings(company._id);
      if (!settings.billing.autoDisable) return;
      result.companies += 1;

      const cutoff = addDays(now, -settings.billing.graceDays);
      const due = await Customer.find({
        status: "active",
        autoDisable: true,
        billingType: "prepaid",
        deletedAt: null,
        expiryDate: { $lt: cutoff },
      });
      if (!due.length) return;

      const byRouter = new Map<string, CustomerDoc[]>();
      for (const c of due) {
        const key = String(c.router);
        byRouter.set(key, [...(byRouter.get(key) ?? []), c]);
      }

      for (const [routerId, customers] of byRouter) {
        const router = await MikrotikRouter.findById(new Types.ObjectId(routerId)).select("+password");
        let routerError: string | undefined;
        const done = new Set<string>();

        if (router) {
          try {
            // One connection per router for the whole batch.
            await withRouter(router, async (d) => {
              for (const c of customers) {
                if (c.connectionType === "pppoe") {
                  await d.setSecretDisabled(c.pppoe.username, true).catch(() => undefined);
                  await d.kick(c.pppoe.username);
                }
                done.add(c.id);
              }
            });
          } catch (err) {
            routerError = (err as Error).message;
            result.routerFailures += 1;
          }
        } else {
          routerError = "Router not found";
        }

        for (const c of customers) {
          const synced = done.has(c.id);
          const r = await Customer.updateOne(
            { _id: c._id, status: "active" }, // don't override a concurrent recharge
            {
              $set: {
                status: "expired",
                syncStatus: synced ? "synced" : "failed",
                ...(synced ? {} : { syncError: routerError ?? "Router sync failed" }),
              },
              ...(synced ? { $unset: { syncError: 1 } } : {}),
            },
          );
          if (r.modifiedCount) {
            result.expired += 1;
            sendEventSms(company._id, "expired", c);
          }
        }
      }
    });
  }
  return result;
}
