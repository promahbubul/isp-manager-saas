import { Request, Response, Router } from "express";
import { Types } from "mongoose";
import { auth, authorize } from "../../middlewares/auth";
import { addDays } from "../../utils/duration";
import sendResponse from "../../utils/sendResponse";
import { Customer } from "../customer/customer.model";
import { Payment } from "../payment/payment.model";
import { getSettings } from "../setting/setting.model";

/**
 * Simple, explainable analytics (no black-box model):
 *  - churn risk: rules an ISP manager would use, each adding points
 *  - collection forecast: what is due in the next 30 days × how often people actually renew
 */
const round = (n: number) => Math.round(n);

async function renewalRate(companyId: Types.ObjectId, now: Date) {
  // Prepaid customers whose validity ended 14–104 days ago: did they pay within 14 days of expiry?
  const from = addDays(now, -104);
  const to = addDays(now, -14);
  const pays = await Payment.aggregate<{ renewed: number; total: number }>([
    { $match: { company: companyId, status: "success", type: "recharge", previousExpiry: { $gte: from, $lt: to } } },
    { $project: { late: { $subtract: ["$createdAt", "$previousExpiry"] } } },
    { $group: { _id: null, total: { $sum: 1 }, renewed: { $sum: { $cond: [{ $lte: ["$late", 14 * 86_400_000] }, 1, 0] } } } },
  ]);
  const expiredNotPaid = await Customer.countDocuments({ company: companyId, billingType: "prepaid", deletedAt: null, status: "expired", expiryDate: { $gte: from, $lt: to } });
  const total = (pays[0]?.total ?? 0) + expiredNotPaid;
  return total >= 10 ? (pays[0]?.renewed ?? 0) / total : 0.85; // too little history: assume a typical 85 %
}

export async function analytics(companyId: string, now = new Date()) {
  const company = new Types.ObjectId(companyId);
  const settings = await getSettings(companyId);
  const grace = settings.billing.graceDays;
  const in30 = addDays(now, 30);
  const sixMonths = addDays(now, -182);

  const [dueSoon, postpaid, latePayers, lost, rate, counts] = await Promise.all([
    Customer.aggregate<{ count: number; amount: number }>([
      { $match: { company, deletedAt: null, billingType: "prepaid", status: { $in: ["active", "expired"] }, expiryDate: { $lt: in30, $gte: addDays(now, -30) } } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: { $add: [{ $max: [0, { $subtract: ["$monthlyFee", "$discount"] }] }, "$dueAmount"] } } } },
    ]),
    Customer.aggregate<{ count: number; amount: number }>([
      { $match: { company, deletedAt: null, billingType: "postpaid", status: { $in: ["active", "expired"] } } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: { $max: [0, { $subtract: ["$monthlyFee", "$discount"] }] } } } },
    ]),
    // paid more than `grace` days after expiry, twice or more in 6 months
    Payment.aggregate<{ _id: Types.ObjectId; late: number }>([
      { $match: { company, status: "success", type: "recharge", createdAt: { $gte: sixMonths }, previousExpiry: { $ne: null } } },
      { $match: { $expr: { $gt: [{ $subtract: ["$createdAt", "$previousExpiry"] }, (grace + 1) * 86_400_000] } } },
      { $group: { _id: "$customer", late: { $sum: 1 } } },
      { $match: { late: { $gte: 2 } } },
    ]),
    Customer.countDocuments({ company, deletedAt: null, billingType: "prepaid", status: "expired", expiryDate: { $lt: addDays(now, -30) } }),
    renewalRate(company, now),
    Customer.aggregate<{ _id: string; n: number }>([{ $match: { company, deletedAt: null } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);

  // Churn risk list: score each candidate, keep the top 50.
  const lateSet = new Map(latePayers.map((l) => [String(l._id), l.late]));
  const candidates = await Customer.find({
    company,
    deletedAt: null,
    status: { $in: ["active", "expired"] },
    $or: [{ status: "expired" }, { dueAmount: { $gt: 0 } }, { _id: { $in: latePayers.map((l) => l._id) } }, { expiryDate: { $lt: addDays(now, 3) } }],
  })
    .select("name customerId phone status expiryDate dueAmount monthlyFee zone")
    .populate("zone", "name")
    .limit(2000);

  const risk = candidates
    .map((c) => {
      const reasons: string[] = [];
      let score = 0;
      const daysExpired = Math.floor((now.getTime() - c.expiryDate.getTime()) / 86_400_000);
      if (c.status === "expired" && daysExpired > 0) {
        score += Math.min(50, 10 + daysExpired * 2);
        reasons.push(`expired ${daysExpired} day(s) ago`);
      } else if (daysExpired > -3) {
        score += 10;
        reasons.push("expires within 3 days");
      }
      if (c.dueAmount > 0) {
        score += Math.min(25, Math.round((c.dueAmount / Math.max(c.monthlyFee, 1)) * 15));
        reasons.push(`due ৳${c.dueAmount}`);
      }
      const late = lateSet.get(c.id);
      if (late) {
        score += late * 8;
        reasons.push(`paid late ${late}× in 6 months`);
      }
      return { customer: c, score: Math.min(100, score), reasons };
    })
    .filter((r) => r.score >= 20 && !(r.customer.status === "expired" && now.getTime() - r.customer.expiryDate.getTime() > 60 * 86_400_000)) // >60 days: already lost
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  const gross = (dueSoon[0]?.amount ?? 0) + (postpaid[0]?.amount ?? 0);
  const statusCounts = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  const base = (statusCounts.active ?? 0) + (statusCounts.expired ?? 0);
  return {
    forecast: {
      next30Days: {
        prepaidCustomers: dueSoon[0]?.count ?? 0,
        prepaidAmount: round(dueSoon[0]?.amount ?? 0),
        postpaidCustomers: postpaid[0]?.count ?? 0,
        postpaidAmount: round(postpaid[0]?.amount ?? 0),
        gross: round(gross),
        renewalRate: Math.round(rate * 1000) / 10,
        expected: round(gross * rate),
      },
    },
    churn: {
      lostCustomers: lost,
      lostRate: base ? Math.round((lost / base) * 1000) / 10 : 0,
      atRisk: risk.length,
      list: risk,
    },
    statusCounts,
  };
}

export const analyticsRoutes = Router();
analyticsRoutes.get("/", auth(), authorize("report.view"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Analytics", data: await analytics(req.user!.company) });
});
