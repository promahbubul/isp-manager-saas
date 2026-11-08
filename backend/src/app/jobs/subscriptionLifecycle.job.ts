import config from "../config";
import { emailLayout, sendEmail } from "../services/email/email.service";
import { getPlatformSettings } from "../modules/billing/billing.model";
import { Company } from "../modules/company/company.model";
import { notifyRoles } from "../modules/notification/notification.service";
import { Subscription } from "../modules/subscription/subscription.model";
import { addDays } from "../utils/duration";
import { runWithTenant } from "../utils/tenantContext";

export type LifecycleResult = { trialEnded: number; pastDue: number; suspended: number; reminded: number };

/**
 * Hourly (PLAN.md §2.3):
 *   trial ended (no paid plan)        → suspended (read-only)
 *   paid period ended                 → past_due (still writable for graceDays)
 *   past_due + graceDays              → suspended
 * plus in-app reminders 7 and 1 day(s) before a period ends.
 * Archiving/deleting tenants stays a manual super-admin action.
 */
export async function runSubscriptionLifecycle(now = new Date()): Promise<LifecycleResult> {
  const result: LifecycleResult = { trialEnded: 0, pastDue: 0, suspended: 0, reminded: 0 };
  const { graceDays } = await getPlatformSettings();

  // 1. Trials that ran out
  const trials = await Company.find({ status: "trial", trialEndsAt: { $lt: now } }).select("_id");
  for (const c of trials) {
    const paid = await Subscription.exists({ company: c._id, status: "active", currentPeriodEnd: { $gt: now } });
    if (paid) {
      await Company.updateOne({ _id: c._id }, { status: "active" });
      continue;
    }
    await Company.updateOne({ _id: c._id, status: "trial" }, { status: "suspended" });
    await Subscription.updateOne({ company: c._id, status: "trialing" }, { status: "expired" });
    await runWithTenant(c.id, () =>
      notifyRoles(c._id, ["owner"], { title: "Your free trial has ended", body: "Choose a plan to continue using the panel.", link: "/dashboard/billing/subscription" }),
    );
    result.trialEnded += 1;
  }

  // 2. Paid periods that ended → past_due
  const lapsed = await Subscription.find({ status: "active", currentPeriodEnd: { $lt: now } });
  for (const s of lapsed) {
    await Subscription.updateOne({ _id: s._id, status: "active" }, { status: "past_due" });
    await Company.updateOne({ _id: s.company, status: "active" }, { status: "past_due" });
    await runWithTenant(String(s.company), () =>
      notifyRoles(s.company, ["owner"], {
        title: "Subscription payment due",
        body: `Renew within ${graceDays} day(s) to avoid suspension.`,
        link: "/dashboard/billing/subscription",
      }),
    );
    result.pastDue += 1;
  }

  // 3. Grace period over → suspended
  const overdue = await Subscription.find({ status: "past_due", currentPeriodEnd: { $lt: addDays(now, -graceDays) } });
  for (const s of overdue) {
    const r = await Company.updateOne({ _id: s.company, status: { $in: ["past_due", "active"] } }, { status: "suspended" });
    if (r.modifiedCount) result.suspended += 1;
  }

  // 4. Renewal reminders (7 days and 1 day before), once per window using the hour the job runs
  for (const days of [7, 1]) {
    const from = addDays(now, days);
    const to = new Date(from.getTime() + 60 * 60 * 1000);
    const due = await Subscription.find({ status: "active", currentPeriodEnd: { $gte: from, $lt: to } });
    for (const s of due) {
      await runWithTenant(String(s.company), () =>
        notifyRoles(s.company, ["owner"], {
          title: `Subscription renews in ${days} day${days > 1 ? "s" : ""}`,
          body: "Pay now to avoid interruption.",
          link: "/dashboard/billing/subscription",
        }),
      );
      const company = await Company.findById(s.company).select("name email");
      if (company?.email) {
        void sendEmail({
          to: company.email,
          subject: `Your ${config.appName} subscription renews in ${days} day${days > 1 ? "s" : ""}`,
          html: emailLayout(`Subscription renews in ${days} day${days > 1 ? "s" : ""}`, [["Company", company.name], ["Paid until", s.currentPeriodEnd.toISOString().slice(0, 10)]], { text: "Renew now", url: `${config.appUrl}/dashboard/billing/subscription` }),
        });
      }
      result.reminded += 1;
    }
  }
  return result;
}
