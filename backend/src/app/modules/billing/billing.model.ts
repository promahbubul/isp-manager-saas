import { model, Schema, Types } from "mongoose";

/** Invoice the platform issues to an ISP for its subscription. */
export interface ISubscriptionInvoice {
  company: Types.ObjectId;
  invoiceNo: string;
  plan: Types.ObjectId;
  planName: string;
  interval: "monthly" | "yearly";
  amount: number;
  /** list price before the coupon */
  listPrice?: number;
  discount?: number;
  coupon?: string;
  currency: "BDT" | "USD";
  status: "open" | "paid" | "void";
  periodStart?: Date;
  periodEnd?: Date;
  paidAt?: Date;
  gateway?: string;
  attempt?: Types.ObjectId;
}

const invoiceSchema = new Schema<ISubscriptionInvoice>(
  {
    company: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    invoiceNo: { type: String, required: true, unique: true },
    plan: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
    planName: { type: String, required: true },
    interval: { type: String, enum: ["monthly", "yearly"], required: true },
    amount: { type: Number, required: true },
    listPrice: Number,
    discount: Number,
    coupon: String,
    currency: { type: String, enum: ["BDT", "USD"], default: "BDT" },
    status: { type: String, enum: ["open", "paid", "void"], default: "open" },
    periodStart: Date,
    periodEnd: Date,
    paidAt: Date,
    gateway: String,
    attempt: { type: Schema.Types.ObjectId, ref: "PaymentAttempt" },
  },
  { timestamps: true },
);
invoiceSchema.index({ company: 1, createdAt: -1 });

export const SubscriptionInvoice = model<ISubscriptionInvoice>("SubscriptionInvoice", invoiceSchema);

/** Singleton platform-wide settings (_id = "global"). */
export interface IPlatformSetting {
  _id: string;
  /** price of one SMS credit for ISPs */
  smsCreditPriceBDT: number;
  smsCreditPriceUSD: number;
  /** days an ISP keeps write access after the subscription period ends */
  graceDays: number;
}

const platformSettingSchema = new Schema<IPlatformSetting>(
  {
    _id: { type: String, default: "global" },
    smsCreditPriceBDT: { type: Number, default: 0.35, min: 0 },
    smsCreditPriceUSD: { type: Number, default: 0.004, min: 0 },
    graceDays: { type: Number, default: 7, min: 0, max: 60 },
  },
  { timestamps: true },
);

export const PlatformSetting = model<IPlatformSetting>("PlatformSetting", platformSettingSchema);

export async function getPlatformSettings() {
  return PlatformSetting.findOneAndUpdate(
    { _id: "global" },
    { $setOnInsert: { _id: "global" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).orFail();
}
