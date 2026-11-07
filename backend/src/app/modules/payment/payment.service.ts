import mongoose, { isValidObjectId } from "mongoose";
import AppError from "../../errors/AppError";
import { parseDay } from "../../utils/date";
import { addDays } from "../../utils/duration";
import { paginate } from "../../utils/paginate";
import { Company } from "../company/company.model";
import { nextSequence } from "../counter/counter.model";
import { Customer } from "../customer/customer.model";
import { Actor, findCustomerOrThrow } from "../customer/customer.service";
import { loadCustomerWithSecret, syncCustomer } from "../customer/customer.sync";
import { Package } from "../package/package.model";
import { getSettings } from "../setting/setting.model";
import { sendEventSms } from "../sms/sms.service";
import { formatDhakaDate } from "../../utils/date";
import { allocateToInvoices } from "../invoice/invoice.service";
import { Reseller, resellerRate } from "../reseller/reseller.model";
import { changeResellerBalance } from "../reseller/reseller.service";
import { IPayment, Payment } from "./payment.model";
import { RechargeInput } from "./payment.validation";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Billing math for a prepaid recharge.
 *   bill        = months × (monthlyFee − customer discount) − one-off discount
 *   totalDue    = previous due + bill
 *   available   = cash now + advance balance
 *   dueAfter    = max(0, totalDue − available)
 *   balanceAfter= max(0, available − totalDue)
 */
export function calculateRecharge(opts: {
  months: number;
  monthlyFee: number;
  customerDiscount: number;
  discount: number;
  previousDue: number;
  balance: number;
  amount?: number;
  /** VAT/tax % added on the discounted bill */
  vatPercent?: number;
}) {
  const perMonth = Math.max(0, opts.monthlyFee - opts.customerDiscount);
  const net = round2(opts.months * perMonth - opts.discount);
  if (net < 0) throw new AppError(400, "Discount is larger than the bill");
  const vat = round2((net * (opts.vatPercent ?? 0)) / 100);
  const bill = round2(net + vat);
  const totalDue = round2(opts.previousDue + bill);
  const amount = opts.amount ?? Math.max(0, round2(totalDue - opts.balance));
  const available = round2(amount + opts.balance);
  return {
    bill,
    vat,
    amount,
    totalDue,
    dueAfter: Math.max(0, round2(totalDue - available)),
    balanceAfter: Math.max(0, round2(available - totalDue)),
  };
}

export type ApplyRechargeInput = {
  company: string;
  customerId: string | mongoose.Types.ObjectId;
  months: number;
  /** cash received; undefined = full payable */
  amount?: number;
  discount?: number;
  method: IPayment["method"];
  trxId?: string;
  note?: string;
  /** staff user; empty for customer self-payments */
  receivedBy?: string;
  source?: IPayment["source"];
  onlinePayment?: mongoose.Types.ObjectId;
  /** recharge done by this reseller: the reseller rate is taken from their balance */
  chargeReseller?: string;
};

/**
 * Core recharge used by staff (POST /payments/recharge) and by online/manual
 * customer payments. Runs in a transaction, then reconnects the customer on
 * MikroTik and sends the payment SMS. Must run inside the tenant context.
 */
export async function applyRecharge(input: ApplyRechargeInput) {
  let current = await Customer.findOne({ _id: input.customerId, deletedAt: null });
  if (!current) throw new AppError(404, "Customer not found");
  // "Next cycle" package change: the new package takes effect with this recharge.
  let packageSwitched = false;
  if (current.pendingPackage) {
    const next = await Package.findOne({ _id: current.pendingPackage, isActive: true });
    await Customer.updateOne({ _id: current._id }, next ? { package: next._id, router: next.router, monthlyFee: next.price, pendingPackage: null } : { pendingPackage: null });
    packageSwitched = Boolean(next);
    current = (await Customer.findById(current._id))!;
  }
  if (current.status === "free") throw new AppError(400, "Free customers do not need recharge");
  const pkg = await Package.findById(current.package).select("validityDays price vatPercent");
  if (!pkg) throw new AppError(400, "Customer's package not found");
  const postpaid = current.billingType === "postpaid";
  if (input.chargeReseller && String(current.reseller ?? "") !== input.chargeReseller) throw new AppError(404, "Customer not found");
  const reseller = input.chargeReseller ? await Reseller.findById(input.chargeReseller) : null;
  if (input.chargeReseller && !reseller) throw new AppError(403, "Reseller account not found");

  const session = await mongoose.startSession();
  let paymentId!: mongoose.Types.ObjectId;
  let reconnect = false;
  try {
    await session.withTransaction(async () => {
      // Re-read inside the transaction so concurrent recharges cannot double-count.
      const customer = await Customer.findById(current._id).session(session).orFail();
      const discount = input.discount ?? 0;
      // Postpaid: the bill is already on the invoices, the payment only settles due.
      const calc = calculateRecharge({
        months: postpaid ? 0 : input.months,
        monthlyFee: customer.monthlyFee,
        customerDiscount: customer.discount,
        discount: postpaid ? 0 : discount,
        previousDue: customer.dueAmount,
        balance: customer.balance,
        amount: input.amount,
        vatPercent: postpaid ? 0 : (pkg.vatPercent ?? 0),
      });
      if (postpaid && calc.amount <= 0) throw new AppError(400, "Nothing is due for this postpaid customer");

      const now = new Date();
      const previousExpiry = customer.expiryDate;
      const previousDue = customer.dueAmount;
      const base = previousExpiry > now ? previousExpiry : now;
      const newExpiry = postpaid ? previousExpiry : addDays(base, input.months * pkg.validityDays);

      // Postpaid is reconnected once nothing is due any more.
      const settled = !postpaid || calc.dueAfter <= 0;
      reconnect = customer.status === "expired" && settled;
      customer.set({
        expiryDate: newExpiry,
        dueAmount: calc.dueAfter,
        balance: calc.balanceAfter,
        // Manually disabled customers stay disabled until staff enable them.
        status: customer.status === "disabled" ? "disabled" : settled ? "active" : customer.status,
      });
      await customer.save({ session });
      const settledAmount = round2(previousDue - calc.dueAfter);
      const invoices = postpaid ? await allocateToInvoices(customer._id, settledAmount, session) : undefined;
      // Postpaid: the reseller pays their rate in proportion to the bill settled.
      const rate = reseller ? resellerRate(reseller, pkg) : 0;
      const resellerCost = reseller ? round2(postpaid ? (settledAmount * rate) / Math.max(pkg.price, 1) : input.months * rate) : undefined;

      const [payment] = await Payment.create(
        [
          {
            company: customer.company,
            receiptNo: await nextSequence(customer.company, "receipt", session),
            customer: customer._id,
            type: "recharge",
            amount: calc.amount,
            billAmount: calc.bill,
            vat: calc.vat,
            discount,
            months: input.months,
            method: input.method,
            trxId: input.trxId,
            previousExpiry,
            newExpiry,
            previousDue,
            dueAfter: calc.dueAfter,
            receivedBy: input.receivedBy,
            source: input.source ?? "staff",
            onlinePayment: input.onlinePayment,
            note: input.note,
            reseller: reseller?._id ?? null,
            resellerCost,
            invoices,
          },
        ],
        { session },
      );
      paymentId = payment._id;
      if (reseller && resellerCost) {
        await changeResellerBalance(
          reseller._id,
          { type: "recharge", amount: -resellerCost, customer: customer._id, payment: payment._id, note: `${customer.customerId} ${postpaid ? "bill" : `${input.months} month(s)`}`, by: input.receivedBy ? new mongoose.Types.ObjectId(input.receivedBy) : undefined },
          session,
          -reseller.creditLimit,
        );
      }
    });
  } finally {
    await session.endSession();
  }

  // Outside the transaction: talk to the router.
  let sync;
  if (reconnect || packageSwitched) {
    const customer = await loadCustomerWithSecret(current._id);
    if (customer) sync = await syncCustomer(customer);
  }
  const payment = await Payment.findById(paymentId).orFail();
  const fresh = await Customer.findById(current._id);
  if (fresh) {
    sendEventSms(input.company, "payment_success", fresh, {
      amount: payment.amount,
      expiry: payment.newExpiry ? formatDhakaDate(payment.newExpiry) : undefined,
      due: payment.dueAfter,
      receiptNo: payment.receiptNo,
    });
  }
  return { payment, sync };
}

async function recharge(actor: Actor, input: RechargeInput) {
  const scoped = await findCustomerOrThrow(actor, input.customer);
  const { payment, sync } = await applyRecharge({
    company: actor.company,
    customerId: scoped._id,
    months: input.months,
    amount: input.amount,
    discount: input.discount,
    method: input.method,
    trxId: input.trxId,
    note: input.note,
    receivedBy: actor.id,
    chargeReseller: actor.role === "reseller" ? actor.reseller : undefined,
  });
  return { payment: await receipt(actor, String(payment._id)), sync };
}

/** aggregate() does not cast like find(), so convert id strings ourselves. */
function toObjectIds(filter: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...filter };
  for (const key of ["customer", "receivedBy"]) {
    if (typeof out[key] === "string") out[key] = new mongoose.Types.ObjectId(out[key] as string);
  }
  return out;
}

async function list(actor: Actor, query: Record<string, unknown>) {
  const filter: Record<string, unknown> = {};
  // Collectors only see what they collected.
  if (actor.role === "collector") filter.receivedBy = actor.id;
  for (const key of ["customer", "receivedBy"] as const) {
    const v = query[key];
    if (typeof v === "string" && isValidObjectId(v) && !(key === "receivedBy" && filter.receivedBy)) filter[key] = v;
  }
  const range: Record<string, Date> = {};
  const from = parseDay(query.from);
  const to = parseDay(query.to);
  if (from) range.$gte = from;
  if (to) range.$lt = addDays(to, 1); // inclusive end date
  if (Object.keys(range).length) filter.createdAt = range;

  const result = await paginate<IPayment>(Payment, filter, query, {
    filterFields: ["method", "type", "status"],
    populate: [
      { path: "customer", select: "name customerId phone" },
      { path: "receivedBy", select: "name" },
    ],
  });
  const totals = await Payment.aggregate<{ amount: number; count: number }>([
    { $match: { ...toObjectIds(filter), status: "success" } },
    { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  return { ...result, totals: { amount: totals[0]?.amount ?? 0, count: totals[0]?.count ?? 0 } };
}

/** Everything needed to print a money receipt. */
async function receipt(actor: Actor, id: string) {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid payment id");
  const payment = await Payment.findById(id)
    .populate({ path: "customer", select: "name customerId phone address pppoe.username package zone" })
    .populate({ path: "receivedBy", select: "name" });
  if (!payment) throw new AppError(404, "Payment not found");
  if (actor.role === "collector" && String(payment.receivedBy?._id ?? payment.receivedBy) !== actor.id) {
    throw new AppError(404, "Payment not found");
  }
  const [company, settings] = await Promise.all([
    Company.findById(actor.company).select("name phone email address logo"),
    getSettings(actor.company),
  ]);
  return { ...payment.toJSON(), company, receiptText: settings.receipt };
}

export const PaymentService = { recharge, list, receipt };
