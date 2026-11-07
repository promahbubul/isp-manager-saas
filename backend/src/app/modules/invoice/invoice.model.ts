import { HydratedDocument, model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

/** Monthly bill for a postpaid customer (prepaid customers pay by recharge instead). */
export interface ICustomerInvoice {
  company: Types.ObjectId;
  invoiceNo: string;
  customer: Types.ObjectId;
  /** "2026-11" — the month being billed */
  period: string;
  amount: number;
  paid: number;
  status: "unpaid" | "partial" | "paid" | "void";
  issuedAt: Date;
  dueDate: Date;
  paidAt?: Date;
  note?: string;
}
export type CustomerInvoiceDoc = HydratedDocument<ICustomerInvoice>;

const schema = new Schema<ICustomerInvoice>(
  {
    invoiceNo: { type: String, required: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    period: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    amount: { type: Number, required: true, min: 0 },
    paid: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["unpaid", "partial", "paid", "void"], default: "unpaid" },
    issuedAt: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    paidAt: Date,
    note: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);
schema.plugin(tenantPlugin);
schema.index({ company: 1, invoiceNo: 1 }, { unique: true });
// one invoice per customer per month (the job may run twice safely)
schema.index({ company: 1, customer: 1, period: 1 }, { unique: true });
schema.index({ company: 1, status: 1, dueDate: 1 });

export const CustomerInvoice = model<ICustomerInvoice>("CustomerInvoice", schema);
