import { Company } from "../modules/company/company.model";
import { Customer } from "../modules/customer/customer.model";
import { getSettings } from "../modules/setting/setting.model";
import { sendEventSms } from "../modules/sms/sms.service";
import { addDays } from "../utils/duration";
import { runWithTenant } from "../utils/tenantContext";

/**
 * Daily: SMS customers whose validity ends within `reminderDaysBefore` days.
 * One reminder per billing period (tracked by reminderSentFor = expiryDate).
 */
export async function sendExpiryReminders(now = new Date()): Promise<{ reminded: number }> {
  let reminded = 0;
  const companies = await Company.find({ status: { $in: ["trial", "active", "past_due"] }, deletedAt: null }).select("_id");

  for (const company of companies) {
    await runWithTenant(company.id, async () => {
      const settings = await getSettings(company._id);
      if (!settings.sms?.autoEvents?.expiry_reminder) return;
      const until = addDays(now, settings.sms.reminderDaysBefore ?? 3);

      const customers = await Customer.find({
        status: "active",
        billingType: "prepaid",
        deletedAt: null,
        expiryDate: { $gt: now, $lte: until },
      });
      for (const c of customers) {
        if (c.reminderSentFor && c.reminderSentFor.getTime() === c.expiryDate.getTime()) continue;
        // Mark first so a crash never sends the same reminder twice.
        const r = await Customer.updateOne(
          { _id: c._id, expiryDate: c.expiryDate },
          { $set: { reminderSentFor: c.expiryDate } },
          { timestamps: false },
        );
        if (!r.modifiedCount) continue;
        sendEventSms(company._id, "expiry_reminder", c);
        reminded += 1;
      }
    });
  }
  return { reminded };
}
