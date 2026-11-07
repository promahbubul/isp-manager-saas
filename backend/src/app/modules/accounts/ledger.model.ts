import { model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

/**
 * ISP's own books besides customer bills: expenses (bandwidth, rent, salary, equipment)
 * and other income. Customer payments are read from Payment, not copied here.
 */
export const LEDGER_TYPES = ["income", "expense"] as const;
export const LEDGER_METHODS = ["cash", "bank", "bkash", "nagad", "rocket", "other"] as const;
/** manual = typed in by staff; others are created automatically by that module */
export const LEDGER_SOURCES = ["manual", "salary", "inventory", "reseller_deposit"] as const;

export const DEFAULT_CATEGORIES = {
  expense: ["Bandwidth", "Salary", "Office rent", "Electricity", "Equipment", "Fiber & cable", "Transport", "Mobile & internet", "Marketing", "Repair", "Tax & licence", "Other"],
  income: ["Reseller deposit", "Equipment sale", "Installation", "Other"],
};

export interface ILedgerEntry {
  company: Types.ObjectId;
  type: (typeof LEDGER_TYPES)[number];
  category: string;
  amount: number;
  date: Date;
  method: (typeof LEDGER_METHODS)[number];
  note?: string;
  source: (typeof LEDGER_SOURCES)[number];
  ref?: Types.ObjectId;
  createdBy?: Types.ObjectId;
}

const schema = new Schema<ILedgerEntry>(
  {
    type: { type: String, enum: LEDGER_TYPES, required: true },
    category: { type: String, required: true, trim: true, maxlength: 50 },
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true },
    method: { type: String, enum: LEDGER_METHODS, default: "cash" },
    note: { type: String, maxlength: 500 },
    source: { type: String, enum: LEDGER_SOURCES, default: "manual" },
    ref: { type: Schema.Types.ObjectId },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
schema.plugin(tenantPlugin);
schema.index({ company: 1, date: -1, _id: -1 });
schema.index({ company: 1, type: 1, category: 1, date: -1 });
schema.index({ company: 1, source: 1, ref: 1 });

export const LedgerEntry = model<ILedgerEntry>("LedgerEntry", schema);
