import { HydratedDocument, model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

export const PAYMENT_METHODS = ["cash", "bkash", "nagad", "rocket", "bank", "online", "sslcommerz", "stripe"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface IPayment {
  company: Types.ObjectId;
  receiptNo: string;
  customer: Types.ObjectId;
  type: "recharge" | "connection_fee" | "other";
  /** cash actually received */
  amount: number;
  /** what this payment was billed for (months × fee + previous due) */
  billAmount: number;
  discount: number;
  months: number;
  method: PaymentMethod;
  trxId?: string;
  previousExpiry?: Date;
  newExpiry?: Date;
  previousDue: number;
  dueAfter: number;
  /** staff who collected; empty for online self-payments */
  receivedBy?: Types.ObjectId;
  source: "staff" | "online" | "manual_online";
  onlinePayment?: Types.ObjectId;
  status: "success" | "refunded";
  note?: string;
}

export type PaymentDoc = HydratedDocument<IPayment>;

const paymentSchema = new Schema<IPayment>(
  {
    receiptNo: { type: String, required: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    type: { type: String, enum: ["recharge", "connection_fee", "other"], default: "recharge" },
    amount: { type: Number, required: true, min: 0 },
    billAmount: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    months: { type: Number, default: 1, min: 0 },
    method: { type: String, enum: PAYMENT_METHODS, default: "cash" },
    trxId: String,
    previousExpiry: Date,
    newExpiry: Date,
    previousDue: { type: Number, default: 0 },
    dueAfter: { type: Number, default: 0 },
    receivedBy: { type: Schema.Types.ObjectId, ref: "User" },
    source: { type: String, enum: ["staff", "online", "manual_online"], default: "staff" },
    onlinePayment: { type: Schema.Types.ObjectId, ref: "PaymentAttempt" },
    status: { type: String, enum: ["success", "refunded"], default: "success" },
    note: String,
  },
  { timestamps: true },
);

paymentSchema.plugin(tenantPlugin);
paymentSchema.index({ company: 1, receiptNo: 1 }, { unique: true });
paymentSchema.index({ company: 1, createdAt: -1 });
paymentSchema.index({ company: 1, customer: 1, createdAt: -1 });
paymentSchema.index({ company: 1, receivedBy: 1, createdAt: -1 });

export const Payment = model<IPayment>("Payment", paymentSchema);
