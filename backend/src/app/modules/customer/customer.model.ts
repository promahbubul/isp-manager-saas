import { HydratedDocument, model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

export const CUSTOMER_STATUSES = ["active", "expired", "disabled", "free", "left"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export interface ICustomer {
  company: Types.ObjectId;
  customerId: string;
  name: string;
  /** optional only for customers imported from MikroTik; the create form requires it */
  phone?: string;
  altPhone?: string;
  email?: string;
  nid?: string;
  address?: string;
  zone?: Types.ObjectId;
  connectionType: "pppoe" | "static" | "hotspot";
  pppoe: { username: string; password: string /* encrypted */ };
  staticIp?: string;
  macAddress?: string;
  package: Types.ObjectId;
  router: Types.ObjectId;
  monthlyFee: number;
  discount: number;
  billingType: "prepaid" | "postpaid";
  expiryDate: Date;
  dueAmount: number;
  balance: number;
  /**
   * active   — paid, connection enabled
   * expired  — validity ended (auto or manual), connection disabled
   * disabled — manually disabled by staff, ignored by billing jobs
   * free     — never expires (staff, VIP)
   * left     — customer left (soft deleted)
   */
  status: CustomerStatus;
  autoDisable: boolean;
  connectionDate: Date;
  device?: { onuMac?: string; boxNo?: string; port?: string };
  note?: string;
  syncStatus: "synced" | "pending" | "failed";
  syncError?: string;
  /** expiryDate the last reminder SMS was sent for (one reminder per billing period) */
  reminderSentFor?: Date;
  deletedAt?: Date | null;
}

export type CustomerDoc = HydratedDocument<ICustomer>;

const customerSchema = new Schema<ICustomer>(
  {
    customerId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    altPhone: String,
    email: { type: String, lowercase: true, trim: true },
    nid: String,
    address: String,
    zone: { type: Schema.Types.ObjectId, ref: "Zone" },
    connectionType: { type: String, enum: ["pppoe", "static", "hotspot"], default: "pppoe" },
    pppoe: {
      username: { type: String, required: true, trim: true },
      password: { type: String, required: true, select: false },
    },
    staticIp: String,
    macAddress: String,
    package: { type: Schema.Types.ObjectId, ref: "Package", required: true },
    router: { type: Schema.Types.ObjectId, ref: "Router", required: true },
    monthlyFee: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    billingType: { type: String, enum: ["prepaid", "postpaid"], default: "prepaid" },
    expiryDate: { type: Date, required: true },
    dueAmount: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: CUSTOMER_STATUSES, default: "active" },
    autoDisable: { type: Boolean, default: true },
    connectionDate: { type: Date, default: () => new Date() },
    device: { onuMac: String, boxNo: String, port: String },
    note: String,
    syncStatus: { type: String, enum: ["synced", "pending", "failed"], default: "pending" },
    syncError: String,
    reminderSentFor: Date,
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        const pppoe = ret.pppoe as Record<string, unknown> | undefined;
        if (pppoe) delete pppoe.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);

customerSchema.plugin(tenantPlugin);
customerSchema.index({ company: 1, customerId: 1 }, { unique: true });
// Unique among current customers only, so a username can be reused after someone leaves.
customerSchema.index(
  { company: 1, "pppoe.username": 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $type: "null" } } },
);
customerSchema.index({ company: 1, phone: 1 });
customerSchema.index({ company: 1, status: 1, expiryDate: 1 });
customerSchema.index({ company: 1, zone: 1 });
customerSchema.index({ status: 1, autoDisable: 1, expiryDate: 1 }); // expire job (cross-tenant)

export const Customer = model<ICustomer>("Customer", customerSchema);
