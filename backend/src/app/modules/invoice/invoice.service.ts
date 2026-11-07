import { ClientSession, isValidObjectId, Types } from "mongoose";
import AppError from "../../errors/AppError";
import { startOfDhakaMonth } from "../../utils/date";
import { addDays } from "../../utils/duration";
import { paginate } from "../../utils/paginate";
import { runWithTenant } from "../../utils/tenantContext";
import { Company } from "../company/company.model";
import { nextSequence } from "../counter/counter.model";
import { Customer } from "../customer/customer.model";
import { getSettings } from "../setting/setting.model";
import { CustomerInvoice, ICustomerInvoice } from "./invoice.model";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "2026-11" for a date, in Dhaka time. */
export function periodOf(date = new Date()) {
  const d = new Date(date.getTime() + 6 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Days after the invoice date the customer has to pay (then the grace days of settings apply). */
export const INVOICE_DUE_DAYS = 10;

/**
 * Issue this month's invoice to every postpaid customer of one company.
 * Idempotent: the unique (customer, period) index makes a second run a no-op.
 * Must run inside the tenant context.
 */
export async function issueMonthlyInvoices(companyId: string, now = new Date()) {
  const period = periodOf(now);
  const issuedAt = startOfDhakaMonth(now);
  const customers = await Customer.find({ billingType: "postpaid", deletedAt: null, status: { $in: ["active", "expired"] } }).select("monthlyFee discount dueAmount");
  let issued = 0;
  for (const c of customers) {
    const amount = round2(Math.max(0, c.monthlyFee - c.discount));
    if (amount <= 0) continue;
    if (await CustomerInvoice.exists({ customer: c._id, period })) continue;
    try {
      await CustomerInvoice.create({
        invoiceNo: await nextSequence(companyId, "invoice"),
        customer: c._id,
        period,
        amount,
        issuedAt,
        dueDate: addDays(issuedAt, INVOICE_DUE_DAYS),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) continue; // a parallel run won
      throw err;
    }
    await Customer.updateOne({ _id: c._id }, { $inc: { dueAmount: amount } });
    issued += 1;
  }
  return issued;
}

/** Worker job (1st of every month): invoices for all companies. */
export async function issueInvoicesForAll(now = new Date()) {
  const companies = await Company.find({ status: { $in: ["trial", "active", "past_due"] }, deletedAt: null }).select("_id");
  let issued = 0;
  for (const c of companies) issued += await runWithTenant(c.id, () => issueMonthlyInvoices(c.id, now));
  return { companies: companies.length, issued };
}

/**
 * Apply money to the oldest open invoices first. Returns the invoices touched.
 * Runs in the recharge transaction.
 */
export async function allocateToInvoices(customerId: Types.ObjectId, amount: number, session: ClientSession) {
  const open = await CustomerInvoice.find({ customer: customerId, status: { $in: ["unpaid", "partial"] } }).sort("period").session(session);
  let left = round2(amount);
  const touched: Types.ObjectId[] = [];
  for (const inv of open) {
    if (left <= 0) break;
    const pay = Math.min(left, round2(inv.amount - inv.paid));
    inv.paid = round2(inv.paid + pay);
    inv.status = inv.paid >= inv.amount ? "paid" : "partial";
    if (inv.status === "paid") inv.paidAt = new Date();
    left = round2(left - pay);
    await inv.save({ session });
    touched.push(inv._id);
  }
  return touched;
}

/** Postpaid customers with an invoice unpaid past due date + grace days (for the cut-off job). */
export async function overduePostpaidCustomerIds(companyId: string, now = new Date()) {
  const settings = await getSettings(companyId);
  const cutoff = addDays(now, -settings.billing.graceDays);
  return CustomerInvoice.distinct("customer", { status: { $in: ["unpaid", "partial"] }, dueDate: { $lt: cutoff } });
}

async function list(query: Record<string, unknown>) {
  const filter: Record<string, unknown> = {};
  if (typeof query.customer === "string" && isValidObjectId(query.customer)) filter.customer = query.customer;
  return paginate<ICustomerInvoice>(CustomerInvoice, filter, query, {
    searchFields: ["invoiceNo"],
    filterFields: ["status", "period"],
    populate: [{ path: "customer", select: "name customerId phone" }],
  });
}

/** Cancel a wrong invoice: removes its unpaid part from the customer's due. */
async function voidInvoice(id: string, note?: string) {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid invoice id");
  const inv = await CustomerInvoice.findById(id);
  if (!inv) throw new AppError(404, "Invoice not found");
  if (inv.status === "void") throw new AppError(400, "Already void");
  if (inv.paid > 0) throw new AppError(400, "This invoice has payments; it cannot be voided");
  inv.status = "void";
  inv.note = note;
  await inv.save();
  await Customer.updateOne({ _id: inv.customer }, [{ $set: { dueAmount: { $max: [0, { $subtract: ["$dueAmount", inv.amount] }] } } }]);
  return inv;
}

export const InvoiceService = { list, voidInvoice, issueMonthlyInvoices };
