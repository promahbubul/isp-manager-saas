import { HydratedDocument, model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

/**
 * Sub-dealer who sells the ISP's connections in their area. They buy balance from the
 * ISP; each recharge they do for their customer deducts the reseller rate from it.
 */
export interface IReseller {
  company: Types.ObjectId;
  name: string;
  phone: string;
  address?: string;
  /** login used by the reseller (role "reseller") */
  user?: Types.ObjectId;
  balance: number;
  /** default rate: package price minus this % */
  discountPercent: number;
  /** per-package monthly rate overrides */
  rates: { package: Types.ObjectId; price: number }[];
  /** how far below zero the balance may go (credit the ISP allows) */
  creditLimit: number;
  isActive: boolean;
  note?: string;
}
export type ResellerDoc = HydratedDocument<IReseller>;

const schema = new Schema<IReseller>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true },
    address: { type: String, maxlength: 300 },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    balance: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    rates: [{ package: { type: Schema.Types.ObjectId, ref: "Package", required: true }, price: { type: Number, required: true, min: 0 }, _id: false }],
    creditLimit: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    note: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);
schema.plugin(tenantPlugin);
schema.index({ company: 1, phone: 1 }, { unique: true });

export const Reseller = model<IReseller>("Reseller", schema);

export const RESELLER_TX_TYPES = ["deposit", "recharge", "refund", "adjust"] as const;

/** Every change to a reseller's balance. */
export interface IResellerTx {
  company: Types.ObjectId;
  reseller: Types.ObjectId;
  type: (typeof RESELLER_TX_TYPES)[number];
  /** + adds to balance, − takes from it */
  amount: number;
  balanceAfter: number;
  customer?: Types.ObjectId;
  payment?: Types.ObjectId;
  method?: string;
  note?: string;
  by?: Types.ObjectId;
}

const txSchema = new Schema<IResellerTx>(
  {
    reseller: { type: Schema.Types.ObjectId, ref: "Reseller", required: true },
    type: { type: String, enum: RESELLER_TX_TYPES, required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer" },
    payment: { type: Schema.Types.ObjectId, ref: "Payment" },
    method: String,
    note: { type: String, maxlength: 300 },
    by: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
txSchema.plugin(tenantPlugin);
txSchema.index({ company: 1, reseller: 1, createdAt: -1 });

export const ResellerTx = model<IResellerTx>("ResellerTx", txSchema);

/** Monthly rate the reseller pays the ISP for a package. */
export function resellerRate(r: Pick<IReseller, "rates" | "discountPercent">, pkg: { _id: Types.ObjectId; price: number }) {
  const override = r.rates.find((x) => String(x.package) === String(pkg._id));
  if (override) return override.price;
  return Math.round(pkg.price * (1 - r.discountPercent / 100) * 100) / 100;
}
