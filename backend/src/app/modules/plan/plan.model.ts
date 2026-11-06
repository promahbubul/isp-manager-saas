import { model, Schema } from "mongoose";

export const PLAN_FEATURES = [
  "online_payment",
  "customer_portal",
  "ticket",
  "reseller",
  "inventory",
  "ip_log",
  "custom_domain",
  "own_sms_gateway",
  "api_access",
  "white_label",
] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

type Price = { monthly: number; yearly: number };

export interface IPlan {
  name: string;
  slug: string;
  description?: string;
  priceBDT: Price;
  priceUSD: Price;
  stripePriceIds: { monthly?: string; yearly?: string };
  /** -1 = unlimited */
  limits: { customers: number; routers: number; staff: number; resellers: number };
  features: PlanFeature[];
  isTrial: boolean;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
}

const price = { monthly: { type: Number, default: 0 }, yearly: { type: Number, default: 0 } };

const planSchema = new Schema<IPlan>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: String,
    priceBDT: price,
    priceUSD: price,
    stripePriceIds: { monthly: String, yearly: String },
    limits: {
      customers: { type: Number, required: true },
      routers: { type: Number, required: true },
      staff: { type: Number, required: true },
      resellers: { type: Number, default: 0 },
    },
    features: [{ type: String, enum: PLAN_FEATURES }],
    isTrial: { type: Boolean, default: false },
    isPublic: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Plan = model<IPlan>("Plan", planSchema);
