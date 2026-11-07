import { HydratedDocument, model, Schema, Types } from "mongoose";
import { GATEWAY_IDS, GatewayId } from "../../services/payment/gateway.types";

export const PAYMENT_SCOPES = ["subscription", "sms_credit", "customer_bill"] as const;
export type PaymentScope = (typeof PAYMENT_SCOPES)[number];

export const ATTEMPT_STATUSES = ["initiated", "pending_review", "success", "failed", "cancelled", "refunded"] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

/**
 * Every online/manual payment try, for both layers:
 *  - subscription / sms_credit: ISP pays the platform (platform gateway account)
 *  - customer_bill: an ISP's customer pays the ISP (the ISP's gateway account)
 * Not tenant-scoped by plugin (super admin lists across tenants); `company` is always set.
 */
export interface IPaymentAttempt {
  tranId: string;
  scope: PaymentScope;
  company: Types.ObjectId;
  gateway: GatewayId;
  amount: number;
  currency: "BDT" | "USD";
  description: string;
  status: AttemptStatus;
  /** what to grant on success */
  refs: {
    invoice?: Types.ObjectId;
    plan?: Types.ObjectId;
    interval?: "monthly" | "yearly";
    smsCredits?: number;
    customer?: Types.ObjectId;
    months?: number;
    coupon?: string;
  };
  payer: { name?: string; email?: string; phone?: string };
  /** gateway session/payment id (SSLCommerz sessionkey, bKash paymentID, Stripe session id) */
  gatewayRef?: string;
  /** gateway transaction id on success, or the payer-entered TrxID for manual */
  gatewayTrxId?: string;
  manual?: { method?: string; senderNumber?: string; note?: string };
  failureReason?: string;
  /** frontend path to return the payer to */
  returnPath: string;
  initiatedBy?: Types.ObjectId;
  reviewedBy?: Types.ObjectId;
  completedAt?: Date;
  refundedAt?: Date;
  refundReason?: string;
  refundedBy?: Types.ObjectId;
  /** Payment (customer bill) created on success */
  payment?: Types.ObjectId;
  raw?: unknown;
}

export type PaymentAttemptDoc = HydratedDocument<IPaymentAttempt>;

const schema = new Schema<IPaymentAttempt>(
  {
    tranId: { type: String, required: true, unique: true },
    scope: { type: String, enum: PAYMENT_SCOPES, required: true },
    company: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    gateway: { type: String, enum: GATEWAY_IDS, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["BDT", "USD"], default: "BDT" },
    description: { type: String, required: true },
    status: { type: String, enum: ATTEMPT_STATUSES, default: "initiated" },
    refs: {
      invoice: { type: Schema.Types.ObjectId, ref: "SubscriptionInvoice" },
      plan: { type: Schema.Types.ObjectId, ref: "Plan" },
      interval: { type: String, enum: ["monthly", "yearly"] },
      smsCredits: Number,
      customer: { type: Schema.Types.ObjectId, ref: "Customer" },
      months: Number,
      coupon: String,
    },
    payer: { name: String, email: String, phone: String },
    gatewayRef: String,
    gatewayTrxId: String,
    manual: { method: String, senderNumber: String, note: String },
    failureReason: String,
    returnPath: { type: String, required: true },
    initiatedBy: { type: Schema.Types.ObjectId },
    reviewedBy: { type: Schema.Types.ObjectId },
    completedAt: Date,
    refundedAt: Date,
    refundReason: String,
    refundedBy: { type: Schema.Types.ObjectId },
    payment: { type: Schema.Types.ObjectId, ref: "Payment" },
    raw: { type: Schema.Types.Mixed, select: false },
  },
  { timestamps: true },
);
schema.index({ company: 1, scope: 1, createdAt: -1 });
schema.index({ scope: 1, status: 1, createdAt: -1 });
schema.index({ company: 1, createdAt: -1, _id: -1 }); // tenant lists (cursor pagination)
schema.index({ gatewayRef: 1 });
// One manual TrxID can be claimed only once per gateway account owner.
schema.index(
  { scope: 1, company: 1, gatewayTrxId: 1 },
  { unique: true, partialFilterExpression: { gateway: "manual", status: { $in: ["pending_review", "success"] } } },
);

export const PaymentAttempt = model<IPaymentAttempt>("PaymentAttempt", schema);
