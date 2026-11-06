import { Types } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { GATEWAY_IDS } from "../../services/payment/gateway.types";
import { addDays } from "../../utils/duration";
import { optionalText } from "../../utils/zod";
import { Company } from "../company/company.model";
import { applyCoupon, redeemCoupon } from "../coupon/coupon.service";
import { notifyRoles } from "../notification/notification.service";
import { PaymentAttempt, PaymentAttemptDoc } from "../onlinePayment/paymentAttempt.model";
import { registerFulfiller, startPayment } from "../onlinePayment/onlinePayment.service";
import { enabledMethods } from "../paymentGateway/gatewayConfig.service";
import { Plan } from "../plan/plan.model";
import { SmsCreditTransaction } from "../sms/sms.model";
import { Subscription } from "../subscription/subscription.model";
import { User } from "../user/user.model";
import { getPlatformSettings, SubscriptionInvoice } from "./billing.model";

type Actor = { id: string; company: string };

const manualFields = {
  trxId: optionalText(60),
  senderNumber: optionalText(20),
  note: optionalText(300),
};

export const planCheckoutSchema = z
  .object({
    plan: z.string(),
    interval: z.enum(["monthly", "yearly"]),
    gateway: z.enum(GATEWAY_IDS),
    coupon: optionalText(30),
    ...manualFields,
  })
  .refine((d) => d.gateway !== "manual" || d.trxId, { path: ["trxId"], message: "Transaction ID is required" });

export const smsCheckoutSchema = z
  .object({ credits: z.coerce.number().int().min(100).max(1_000_000), gateway: z.enum(GATEWAY_IDS), ...manualFields })
  .refine((d) => d.gateway !== "manual" || d.trxId, { path: ["trxId"], message: "Transaction ID is required" });

const RETURN_PATH = "/dashboard/billing/subscription";

/** Stripe charges in USD (international cards); local gateways in BDT. */
const currencyFor = (gateway: string) => (gateway === "stripe" ? "USD" : "BDT");

const addMonths = (d: Date, months: number) => {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
};

async function payer(actor: Actor) {
  const [user, company] = await Promise.all([User.findById(actor.id).select("name email phone"), Company.findById(actor.company).select("name email phone")]);
  return { name: company?.name ?? user?.name, email: company?.email ?? user?.email, phone: company?.phone ?? user?.phone };
}

/** Everything the "My subscription" page needs. */
async function overview(actor: Actor) {
  const [company, subscription, plans, invoices, methods, settings, pending] = await Promise.all([
    Company.findById(actor.company).select("name status trialEndsAt usage smsBalance"),
    Subscription.findOne({ company: actor.company }).populate("plan"),
    Plan.find({ isActive: true, isPublic: true, isTrial: false }).sort("sortOrder").select("-stripePriceIds"),
    SubscriptionInvoice.find({ company: actor.company }).sort("-createdAt").limit(24),
    enabledMethods(null),
    getPlatformSettings(),
    PaymentAttempt.find({ company: actor.company, scope: { $ne: "customer_bill" }, status: "pending_review" }).select("description amount currency gatewayTrxId createdAt"),
  ]);
  return {
    company,
    subscription,
    plans,
    invoices,
    methods,
    pendingManual: pending,
    smsCreditPrice: { BDT: settings.smsCreditPriceBDT, USD: settings.smsCreditPriceUSD },
  };
}

async function checkoutPlan(actor: Actor, input: z.infer<typeof planCheckoutSchema>) {
  if (!Types.ObjectId.isValid(input.plan)) throw new AppError(400, "Invalid plan");
  const plan = await Plan.findOne({ _id: input.plan, isActive: true, isTrial: false });
  if (!plan) throw new AppError(404, "Plan not found");
  const currency = currencyFor(input.gateway);
  const listPrice = (currency === "USD" ? plan.priceUSD : plan.priceBDT)[input.interval];
  if (!(listPrice > 0)) throw new AppError(400, "This plan is priced on request — please contact us");
  const deal = input.coupon
    ? await applyCoupon({ code: input.coupon, company: actor.company, plan: plan._id, interval: input.interval, currency, price: listPrice })
    : null;
  const price = deal ? deal.finalPrice : listPrice;

  // Refuse a downgrade that the current usage would not fit into.
  const company = await Company.findById(actor.company).select("usage");
  for (const r of ["customers", "routers", "staff"] as const) {
    const limit = plan.limits[r];
    if (limit !== -1 && (company?.usage[r] ?? 0) > limit) {
      throw new AppError(400, `You use ${company?.usage[r]} ${r}, but ${plan.name} allows ${limit}. Remove some first or choose a bigger plan.`);
    }
  }

  const invoice = await SubscriptionInvoice.create({
    company: actor.company,
    invoiceNo: `INV-${Date.now().toString(36).toUpperCase()}`,
    plan: plan._id,
    planName: plan.name,
    interval: input.interval,
    amount: price,
    listPrice,
    discount: deal?.discount,
    coupon: deal?.coupon.code,
    currency,
    gateway: input.gateway,
  });

  try {
    const { attempt, redirectUrl } = await startPayment({
      scope: "subscription",
      company: actor.company,
      gateway: input.gateway,
      amount: price,
      currency,
      description: `${plan.name} plan (${input.interval})${deal ? ` — coupon ${deal.coupon.code}` : ""}`,
      payer: await payer(actor),
      refs: { invoice: invoice._id, plan: plan._id, interval: input.interval, coupon: deal?.coupon.code },
      returnPath: RETURN_PATH,
      initiatedBy: actor.id,
      manual: input.gateway === "manual" ? { trxId: input.trxId!, senderNumber: input.senderNumber, note: input.note } : undefined,
    });
    invoice.attempt = attempt._id;
    await invoice.save();
    return { redirectUrl, attempt: { tranId: attempt.tranId, status: attempt.status }, invoice };
  } catch (err) {
    invoice.status = "void";
    await invoice.save();
    throw err;
  }
}

async function checkoutSmsCredits(actor: Actor, input: z.infer<typeof smsCheckoutSchema>) {
  const settings = await getPlatformSettings();
  const currency = currencyFor(input.gateway);
  const unit = currency === "USD" ? settings.smsCreditPriceUSD : settings.smsCreditPriceBDT;
  const amount = Math.round(input.credits * unit * 100) / 100;
  const { attempt, redirectUrl } = await startPayment({
    scope: "sms_credit",
    company: actor.company,
    gateway: input.gateway,
    amount,
    currency,
    description: `${input.credits} SMS credits`,
    payer: await payer(actor),
    refs: { smsCredits: input.credits },
    returnPath: RETURN_PATH,
    initiatedBy: actor.id,
    manual: input.gateway === "manual" ? { trxId: input.trxId!, senderNumber: input.senderNumber, note: input.note } : undefined,
  });
  return { redirectUrl, attempt: { tranId: attempt.tranId, status: attempt.status }, amount, currency };
}

/* ───────────── fulfilment ───────────── */

/**
 * Paid: switch to the plan and extend the period. Renewing the same plan before
 * expiry stacks onto the current end date; switching plans starts today.
 */
async function fulfillSubscription(attempt: PaymentAttemptDoc) {
  const plan = await Plan.findById(attempt.refs.plan).orFail();
  const months = attempt.refs.interval === "yearly" ? 12 : 1;
  const now = new Date();
  const sub = await Subscription.findOne({ company: attempt.company });
  const samePlanActive = sub && sub.status === "active" && String(sub.plan) === String(plan._id) && sub.currentPeriodEnd > now;
  const start = samePlanActive ? sub.currentPeriodEnd : now;
  const end = addMonths(start, months);

  await Subscription.updateOne(
    { company: attempt.company },
    {
      $set: {
        plan: plan._id,
        interval: attempt.refs.interval,
        gateway: attempt.gateway === "manual" ? "manual" : attempt.gateway,
        status: "active",
        currentPeriodStart: samePlanActive ? sub.currentPeriodStart : now,
        currentPeriodEnd: end,
      },
    },
    { upsert: true },
  );
  await Company.updateOne({ _id: attempt.company }, { $set: { status: "active" } });
  if (attempt.refs.coupon) await redeemCoupon(attempt.refs.coupon, attempt.company);
  if (attempt.refs.invoice) {
    await SubscriptionInvoice.updateOne(
      { _id: attempt.refs.invoice },
      { $set: { status: "paid", paidAt: now, periodStart: start, periodEnd: end, gateway: attempt.gateway } },
    );
  }
  await notifyRoles(attempt.company, ["owner"], {
    title: `Payment received — ${plan.name} plan active until ${end.toISOString().slice(0, 10)}`,
    link: RETURN_PATH,
  });
}

async function failSubscription(attempt: PaymentAttemptDoc) {
  if (attempt.refs.invoice) await SubscriptionInvoice.updateOne({ _id: attempt.refs.invoice, status: "open" }, { $set: { status: "void" } });
  if (attempt.gateway === "manual") {
    await notifyRoles(attempt.company, ["owner"], { title: "Your manual payment was rejected", body: attempt.failureReason, link: RETURN_PATH });
  }
}

async function fulfillSmsCredits(attempt: PaymentAttemptDoc) {
  const credits = attempt.refs.smsCredits ?? 0;
  const company = await Company.findByIdAndUpdate(attempt.company, { $inc: { smsBalance: credits } }, { returnDocument: "after" }).orFail();
  await SmsCreditTransaction.create({
    company: attempt.company,
    type: "purchase",
    credits,
    amount: attempt.amount,
    balanceAfter: company.smsBalance,
    note: `${attempt.gateway} ${attempt.gatewayTrxId ?? attempt.tranId}`,
  });
  await notifyRoles(attempt.company, ["owner", "admin"], { title: `${credits} SMS credits added`, link: "/dashboard/sms/send" });
}

registerFulfiller("subscription", fulfillSubscription, failSubscription);
registerFulfiller("sms_credit", fulfillSmsCredits);

export const couponCheckSchema = z.object({ code: z.string().trim().min(3), plan: z.string(), interval: z.enum(["monthly", "yearly"]), gateway: z.enum(GATEWAY_IDS) });

/** Preview a coupon before paying. */
async function checkCoupon(actor: Actor, input: z.infer<typeof couponCheckSchema>) {
  if (!Types.ObjectId.isValid(input.plan)) throw new AppError(400, "Invalid plan");
  const plan = await Plan.findById(input.plan).orFail(new AppError(404, "Plan not found"));
  const currency = currencyFor(input.gateway);
  const listPrice = (currency === "USD" ? plan.priceUSD : plan.priceBDT)[input.interval];
  const { coupon, discount, finalPrice } = await applyCoupon({ code: input.code, company: actor.company, plan: plan._id, interval: input.interval, currency, price: listPrice });
  return { code: coupon.code, description: coupon.description, listPrice, discount, finalPrice, currency };
}

export const BillingService = { overview, checkoutPlan, checkoutSmsCredits, checkCoupon };
