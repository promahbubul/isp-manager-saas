import { model, Schema, Types } from "mongoose";

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "canceled", "expired"] as const;

export interface ISubscription {
  company: Types.ObjectId;
  plan: Types.ObjectId;
  interval: "monthly" | "yearly";
  gateway: "stripe" | "sslcommerz" | "manual" | "none";
  status: (typeof SUBSCRIPTION_STATUSES)[number];
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    // One subscription document per company (platform-owned, not tenant-plugin scoped).
    company: { type: Schema.Types.ObjectId, ref: "Company", required: true, unique: true },
    plan: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
    interval: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
    gateway: { type: String, enum: ["stripe", "sslcommerz", "manual", "none"], default: "none" },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: "trialing", index: true },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true, index: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
  },
  { timestamps: true },
);

export const Subscription = model<ISubscription>("Subscription", subscriptionSchema);
