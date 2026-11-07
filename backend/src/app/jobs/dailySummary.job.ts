import { Types } from "mongoose";
import config from "../config";
import { PlatformSetting } from "../modules/billing/billing.model";
import { Company } from "../modules/company/company.model";
import { Customer } from "../modules/customer/customer.model";
import { Payment } from "../modules/payment/payment.model";
import { getSettings } from "../modules/setting/setting.model";
import { Ticket } from "../modules/ticket/ticket.model";
import { User } from "../modules/user/user.model";
import { emailLayout, sendEmail } from "../services/email/email.service";
import { formatDhakaDate, startOfDhakaDay } from "../utils/date";
import { addDays } from "../utils/duration";
import { runWithTenant } from "../utils/tenantContext";

const taka = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;

/** 21:00 Dhaka: email each ISP owner today's numbers (if SMTP is set and the ISP did not turn it off). */
export async function sendDailySummaries(now = new Date(), force = false) {
  const smtp = await PlatformSetting.findById("global").select("smtp.enabled smtp.host");
  if (!force && !(smtp?.smtp?.enabled && smtp.smtp.host)) return { sent: 0, skipped: "SMTP not configured" };

  const dayStart = startOfDhakaDay(now);
  const dayEnd = addDays(dayStart, 1);
  const companies = await Company.find({ status: { $in: ["trial", "active", "past_due"] }, deletedAt: null }).select("name email owner");
  let sent = 0;
  for (const c of companies) {
    await runWithTenant(c.id, async () => {
      const settings = await getSettings(c._id);
      if (settings.notifications?.dailySummaryEmail === false) return;
      const owner = await User.findById(c.owner).select("email name");
      const to = owner?.email || c.email;
      if (!to) return;
      const company = new Types.ObjectId(c.id);
      const [pay, newCustomers, expiredToday, expiringSoon, openTickets, dueTotal] = await Promise.all([
        Payment.aggregate<{ amount: number; count: number }>([{ $match: { company, status: "success", createdAt: { $gte: dayStart, $lt: dayEnd } } }, { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } }]),
        Customer.countDocuments({ deletedAt: null, createdAt: { $gte: dayStart, $lt: dayEnd } }),
        Customer.countDocuments({ deletedAt: null, status: "expired", expiryDate: { $gte: dayStart, $lt: dayEnd } }),
        Customer.countDocuments({ deletedAt: null, status: "active", billingType: "prepaid", expiryDate: { $gte: dayEnd, $lt: addDays(dayEnd, 3) } }),
        Ticket.countDocuments({ status: { $in: ["open", "in_progress"] } }),
        Customer.aggregate<{ t: number }>([{ $match: { company, deletedAt: null, dueAmount: { $gt: 0 } } }, { $group: { _id: null, t: { $sum: "$dueAmount" } } }]),
      ]);
      const r = await sendEmail({
        to,
        subject: `${c.name}: today ${taka(pay[0]?.amount ?? 0)} collected (${formatDhakaDate(now)})`,
        html: emailLayout(
          `${c.name} — ${formatDhakaDate(now)}`,
          [
            ["Collected today", `${taka(pay[0]?.amount ?? 0)} (${pay[0]?.count ?? 0} payments)`],
            ["New customers", String(newCustomers)],
            ["Expired today", String(expiredToday)],
            ["Expiring in 3 days", String(expiringSoon)],
            ["Open complaints", String(openTickets)],
            ["Total due", taka(dueTotal[0]?.t ?? 0)],
          ],
          { text: "Open dashboard", url: `${config.appUrl}/dashboard` },
        ),
      });
      if (r.ok) sent += 1;
    });
  }
  return { sent };
}
