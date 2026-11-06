import { model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

export const SMS_EVENTS = ["welcome", "payment_success", "expiry_reminder", "expired", "ticket_update"] as const;
export type SmsEvent = (typeof SMS_EVENTS)[number];

/** Variables each template may use (shown in the UI). */
export const SMS_VARIABLES: Record<SmsEvent, string[]> = {
  welcome: ["name", "customerId", "username", "password", "package", "company"],
  payment_success: ["name", "customerId", "amount", "expiry", "due", "receiptNo", "company"],
  expiry_reminder: ["name", "customerId", "expiry", "amount", "due", "company", "pay_link"],
  expired: ["name", "customerId", "amount", "due", "company", "pay_link"],
  ticket_update: ["name", "ticketNo", "status", "company"],
};

export const DEFAULT_TEMPLATES: Record<SmsEvent, string> = {
  welcome: "প্রিয় {name}, {company}-এ স্বাগতম। ইউজারনেম: {username}, পাসওয়ার্ড: {password}, প্যাকেজ: {package}।",
  payment_success: "প্রিয় {name}, {amount} টাকা গ্রহণ করা হয়েছে। নতুন মেয়াদ: {expiry}। রসিদ: {receiptNo}। ধন্যবাদ - {company}",
  expiry_reminder: "প্রিয় {name}, আপনার ইন্টারনেটের মেয়াদ {expiry} তারিখে শেষ হবে। বিল: {amount} টাকা। - {company}",
  expired: "প্রিয় {name}, আপনার ইন্টারনেটের মেয়াদ শেষ হয়েছে। সংযোগ চালু করতে {amount} টাকা পরিশোধ করুন। - {company}",
  ticket_update: "প্রিয় {name}, আপনার অভিযোগ {ticketNo} এর অবস্থা: {status}। - {company}",
};

export interface ISmsTemplate {
  company: Types.ObjectId;
  event: SmsEvent;
  message: string;
  isActive: boolean;
}

const templateSchema = new Schema<ISmsTemplate>(
  {
    event: { type: String, enum: SMS_EVENTS, required: true },
    message: { type: String, required: true, maxlength: 1000 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
templateSchema.plugin(tenantPlugin);
templateSchema.index({ company: 1, event: 1 }, { unique: true });
export const SmsTemplate = model<ISmsTemplate>("SmsTemplate", templateSchema);

export interface ISmsLog {
  company: Types.ObjectId;
  to: string;
  message: string;
  event: SmsEvent | "manual" | "bulk";
  customer?: Types.ObjectId;
  segments: number;
  encoding: "GSM" | "UNICODE";
  status: "queued" | "sent" | "failed";
  error?: string;
  providerResponse?: string;
  provider?: string;
  sentBy?: Types.ObjectId;
}

const logSchema = new Schema<ISmsLog>(
  {
    to: { type: String, required: true },
    message: { type: String, required: true },
    event: { type: String, required: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer" },
    segments: { type: Number, default: 1 },
    encoding: { type: String, enum: ["GSM", "UNICODE"], default: "GSM" },
    status: { type: String, enum: ["queued", "sent", "failed"], default: "queued" },
    error: String,
    providerResponse: String,
    provider: String,
    sentBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
logSchema.plugin(tenantPlugin);
logSchema.index({ company: 1, createdAt: -1 });
logSchema.index({ company: 1, customer: 1, event: 1, createdAt: -1 });
export const SmsLog = model<ISmsLog>("SmsLog", logSchema);

/** Credit purchases and manual adjustments (usage is recorded in SmsLog). */
export interface ISmsCreditTransaction {
  company: Types.ObjectId;
  type: "purchase" | "adjust" | "bonus";
  credits: number;
  balanceAfter: number;
  amount?: number;
  note?: string;
  by?: Types.ObjectId;
}

const creditSchema = new Schema<ISmsCreditTransaction>(
  {
    type: { type: String, enum: ["purchase", "adjust", "bonus"], required: true },
    credits: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    amount: Number,
    note: String,
    by: { type: Schema.Types.ObjectId },
  },
  { timestamps: true },
);
creditSchema.plugin(tenantPlugin);
export const SmsCreditTransaction = model<ISmsCreditTransaction>("SmsCreditTransaction", creditSchema);
