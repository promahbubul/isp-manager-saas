import { model, Schema, Types } from "mongoose";

/** Platform discount codes for subscription purchases. */
export interface ICoupon {
  code: string;
  description?: string;
  type: "percent" | "fixed";
  /** percent: 1–99 · fixed: amount in BDT (fixed coupons only apply to BDT payments) */
  value: number;
  /** empty = every plan */
  plans: Types.ObjectId[];
  intervals: ("monthly" | "yearly")[];
  /** 0 = unlimited */
  maxUses: number;
  used: number;
  /** one use per ISP */
  oncePerCompany: boolean;
  usedBy: Types.ObjectId[];
  validFrom?: Date;
  validTo?: Date;
  isActive: boolean;
}

const schema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: String,
    type: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true, min: 0 },
    plans: [{ type: Schema.Types.ObjectId, ref: "Plan" }],
    intervals: { type: [String], enum: ["monthly", "yearly"], default: ["monthly", "yearly"] },
    maxUses: { type: Number, default: 0, min: 0 },
    used: { type: Number, default: 0 },
    oncePerCompany: { type: Boolean, default: true },
    usedBy: [{ type: Schema.Types.ObjectId, ref: "Company" }],
    validFrom: Date,
    validTo: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Coupon = model<ICoupon>("Coupon", schema);
