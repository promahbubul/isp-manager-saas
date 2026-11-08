import { z } from "zod";
import AppError from "../../errors/AppError";
import { hasFeature } from "../subscription/planFeature";
import { GATEWAY_IDS } from "../../services/payment/gateway.types";
import { normalizeBdPhone } from "../../utils/phone";
import { paginate } from "../../utils/paginate";
import { runWithTenant } from "../../utils/tenantContext";
import { optionalText } from "../../utils/zod";
import { Company } from "../company/company.model";
import { Customer, CustomerDoc } from "../customer/customer.model";
import { notifyRoles } from "../notification/notification.service";
import { Package } from "../package/package.model";
import { applyRecharge, calculateRecharge } from "../payment/payment.service";
import { enabledMethods } from "../paymentGateway/gatewayConfig.service";
import { IPaymentAttempt, PaymentAttempt, PaymentAttemptDoc } from "./paymentAttempt.model";
import { registerFulfiller, reviewManual, startPayment } from "./onlinePayment.service";

/* ───────────── public (customer-facing) ───────────── */

export const lookupSchema = z.object({
  /** customer ID (C-00012) or PPPoE username */
  account: z.string().trim().min(2).max(64),
  phone: z.string().trim().min(6),
});

export const payBillSchema = lookupSchema
  .extend({
    months: z.coerce.number().int().min(1).max(12).default(1),
    gateway: z.enum(GATEWAY_IDS),
    trxId: optionalText(60),
    method: z.enum(["bkash", "nagad", "rocket", "bank"]).optional(),
    senderNumber: optionalText(20),
  })
  .refine((d) => d.gateway !== "manual" || d.trxId, { path: ["trxId"], message: "Transaction ID is required" });

/** Payment links use the ISP's slug; inactive/archived ISPs cannot receive payments. */
async function companyBySlug(slug: string) {
  const company = await Company.findOne({ slug: slug.toLowerCase(), deletedAt: null, status: { $ne: "archived" } }).select("name slug logo phone portalTheme");
  if (!company) throw new AppError(404, "ISP not found");
  if (!(await hasFeature(company._id, "online_payment"))) throw new AppError(404, "Online payment is not available for this ISP");
  return company;
}

/** Customer must prove they know the registered mobile number. */
async function findPayingCustomer(companyId: string, account: string, phone: string): Promise<CustomerDoc> {
  const normalized = normalizeBdPhone(phone);
  const customer = await Customer.findOne({
    company: companyId,
    deletedAt: null,
    $or: [{ customerId: account.toUpperCase() }, { "pppoe.username": account }],
  });
  if (!customer || !normalized || customer.phone !== normalized) {
    throw new AppError(404, "No customer matches this ID and mobile number");
  }
  if (customer.status === "free") throw new AppError(400, "This connection is free — nothing to pay");
  return customer;
}

async function billFor(customer: CustomerDoc, months: number) {
  const pkg = await Package.findById(customer.package).select("vatPercent");
  return calculateRecharge({
    vatPercent: customer.billingType === "postpaid" ? 0 : (pkg?.vatPercent ?? 0),
    months,
    monthlyFee: customer.monthlyFee,
    customerDiscount: customer.discount,
    discount: 0,
    previousDue: customer.dueAmount,
    balance: customer.balance,
  });
}

async function publicInfo(slug: string) {
  const company = await companyBySlug(slug);
  return {
    company: { name: company.name, slug: company.slug, logo: company.logo, phone: company.phone, primaryColor: company.portalTheme?.primaryColor },
    methods: await enabledMethods(company._id),
    whiteLabel: await hasFeature(company._id, "white_label"),
  };
}

async function lookup(slug: string, input: z.infer<typeof lookupSchema>) {
  const company = await companyBySlug(slug);
  const c = await findPayingCustomer(company.id, input.account, input.phone);
  const pkg = await Package.findById(c.package).select("name validityDays");
  return {
    customerId: c.customerId,
    name: c.name,
    package: pkg?.name,
    validityDays: pkg?.validityDays ?? 30,
    status: c.status,
    expiryDate: c.expiryDate,
    monthlyBill: Math.max(0, c.monthlyFee - c.discount),
    dueAmount: c.dueAmount,
    balance: c.balance,
    payableOneMonth: (await billFor(c, 1)).amount,
  };
}

async function payBill(slug: string, input: z.infer<typeof payBillSchema>) {
  const company = await companyBySlug(slug);
  const customer = await findPayingCustomer(company.id, input.account, input.phone);
  const { amount } = await billFor(customer, input.months);
  const { attempt, redirectUrl } = await startPayment({
    scope: "customer_bill",
    company: company._id,
    gateway: input.gateway,
    amount,
    currency: "BDT",
    description: `${company.name} internet bill — ${customer.customerId} (${input.months} month${input.months > 1 ? "s" : ""})`,
    payer: { name: customer.name, email: customer.email, phone: customer.phone },
    refs: { customer: customer._id, months: input.months },
    returnPath: `/pay/${company.slug}`,
    manual:
      input.gateway === "manual"
        ? { trxId: input.trxId!, method: input.method, senderNumber: input.senderNumber }
        : undefined,
  });
  if (attempt.status === "pending_review") {
    await runWithTenant(company.id, () =>
      notifyRoles(company._id, ["owner", "admin", "manager", "accountant"], {
        title: `Manual payment to verify: ${customer.name}`,
        body: `${amount} Tk · ${input.method ?? "manual"} · TrxID ${attempt.gatewayTrxId}`,
        link: "/dashboard/billing/online",
      }),
    );
  }
  return { redirectUrl, tranId: attempt.tranId, status: attempt.status, amount };
}

async function paymentStatus(slug: string, tranId: string) {
  const company = await companyBySlug(slug);
  const a = await PaymentAttempt.findOne({ tranId, company: company._id, scope: "customer_bill" }).populate({ path: "payment", select: "receiptNo newExpiry" });
  if (!a) throw new AppError(404, "Payment not found");
  const payment = a.payment as unknown as { receiptNo?: string; newExpiry?: Date } | undefined;
  return {
    status: a.status,
    amount: a.amount,
    gateway: a.gateway,
    gatewayTrxId: a.gatewayTrxId,
    failureReason: a.failureReason,
    receiptNo: payment?.receiptNo,
    newExpiry: payment?.newExpiry,
  };
}

/* ───────────── fulfilment ───────────── */

/** Paid bill → normal recharge (transaction, reconnect on MikroTik, SMS). */
async function fulfillCustomerBill(attempt: PaymentAttemptDoc) {
  const method = attempt.gateway === "manual" ? ((attempt.manual?.method as "bkash") ?? "bkash") : attempt.gateway;
  const { payment } = await applyRecharge({
    company: String(attempt.company),
    customerId: attempt.refs.customer!,
    months: attempt.refs.months ?? 1,
    amount: attempt.amount,
    method: method as never,
    trxId: attempt.gatewayTrxId,
    source: attempt.gateway === "manual" ? "manual_online" : "online",
    onlinePayment: attempt._id,
    receivedBy: attempt.reviewedBy ? String(attempt.reviewedBy) : undefined,
    note: `Online payment ${attempt.tranId}`,
  });
  await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { payment: payment._id } });
  if (attempt.gateway !== "manual") {
    await notifyRoles(attempt.company, ["owner", "admin", "manager", "accountant"], {
      title: `Online payment received: ${attempt.amount} Tk`,
      body: attempt.description,
      link: "/dashboard/billing/online",
    });
  }
}

registerFulfiller("customer_bill", fulfillCustomerBill);

/* ───────────── ISP staff ───────────── */

async function listForTenant(companyId: string, query: Record<string, unknown>) {
  const filter: Record<string, unknown> = { company: companyId, scope: "customer_bill" };
  return paginate<IPaymentAttempt>(PaymentAttempt, filter, query, {
    searchFields: ["tranId", "gatewayTrxId", "payer.name", "payer.phone"],
    filterFields: ["status", "gateway"],
    populate: [
      { path: "refs.customer", select: "name customerId phone" },
      { path: "payment", select: "receiptNo" },
    ],
  });
}

async function review(companyId: string, attemptId: string, approve: boolean, reviewer: string, reason?: string) {
  return reviewManual(attemptId, approve, reviewer, reason, companyId);
}

export const CustomerBillService = { publicInfo, lookup, payBill, paymentStatus, listForTenant, review };
