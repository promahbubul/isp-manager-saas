import { model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

/** HR record: may or may not have a login (a line man often has none). */
export interface IEmployee {
  company: Types.ObjectId;
  name: string;
  phone: string;
  designation?: string;
  nid?: string;
  address?: string;
  joinDate: Date;
  monthlySalary: number;
  user?: Types.ObjectId;
  isActive: boolean;
  note?: string;
}

const schema = new Schema<IEmployee>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true },
    designation: { type: String, maxlength: 60 },
    nid: { type: String, maxlength: 30 },
    address: { type: String, maxlength: 300 },
    joinDate: { type: Date, required: true },
    monthlySalary: { type: Number, required: true, min: 0 },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    isActive: { type: Boolean, default: true },
    note: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);
schema.plugin(tenantPlugin);
schema.index({ company: 1, isActive: 1, name: 1 });

export const Employee = model<IEmployee>("Employee", schema);

export const SALARY_TYPES = ["salary", "advance", "bonus"] as const;

export interface ISalaryPayment {
  company: Types.ObjectId;
  employee: Types.ObjectId;
  /** "2026-11": the month the salary is for */
  month: string;
  type: (typeof SALARY_TYPES)[number];
  amount: number;
  /** cut from this payment (late, absence, advance recovery) */
  deduction: number;
  method: "cash" | "bank" | "bkash" | "nagad" | "rocket" | "other";
  paidAt: Date;
  note?: string;
  paidBy?: Types.ObjectId;
  ledgerEntry?: Types.ObjectId;
}

const salarySchema = new Schema<ISalaryPayment>(
  {
    employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    type: { type: String, enum: SALARY_TYPES, default: "salary" },
    amount: { type: Number, required: true, min: 0.01 },
    deduction: { type: Number, default: 0, min: 0 },
    method: { type: String, enum: ["cash", "bank", "bkash", "nagad", "rocket", "other"], default: "cash" },
    paidAt: { type: Date, required: true },
    note: { type: String, maxlength: 300 },
    paidBy: { type: Schema.Types.ObjectId, ref: "User" },
    ledgerEntry: { type: Schema.Types.ObjectId, ref: "LedgerEntry" },
  },
  { timestamps: true },
);
salarySchema.plugin(tenantPlugin);
salarySchema.index({ company: 1, month: 1, employee: 1 });
salarySchema.index({ company: 1, employee: 1, paidAt: -1 });

export const SalaryPayment = model<ISalaryPayment>("SalaryPayment", salarySchema);

/** Collector/manager hands collected cash to another staff (e.g. office or owner). */
export interface ICashHandover {
  company: Types.ObjectId;
  from: Types.ObjectId;
  to: Types.ObjectId;
  amount: number;
  status: "pending" | "accepted" | "rejected";
  note?: string;
  decidedAt?: Date;
  decisionNote?: string;
}

const handoverSchema = new Schema<ICashHandover>(
  {
    from: { type: Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
    note: { type: String, maxlength: 300 },
    decidedAt: Date,
    decisionNote: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);
handoverSchema.plugin(tenantPlugin);
handoverSchema.index({ company: 1, from: 1, createdAt: -1 });
handoverSchema.index({ company: 1, to: 1, status: 1 });

export const CashHandover = model<ICashHandover>("CashHandover", handoverSchema);
