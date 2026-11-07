import { HydratedDocument, model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

/** ISP → platform support conversation (not the ISP's own customer tickets). */
export const SUPPORT_CATEGORIES = ["billing", "technical", "mikrotik", "sms", "payment_gateway", "feature_request", "other"] as const;
export const SUPPORT_PRIORITIES = ["low", "normal", "urgent"] as const;
/** open = waiting for the platform · answered = waiting for the ISP · closed */
export const SUPPORT_STATUSES = ["open", "answered", "closed"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export interface ISupportMessage {
  from: "isp" | "platform";
  user?: Types.ObjectId;
  platformUser?: Types.ObjectId;
  name: string;
  text: string;
  at: Date;
}

export interface ISupportTicket {
  company: Types.ObjectId;
  ref: string;
  subject: string;
  category: (typeof SUPPORT_CATEGORIES)[number];
  priority: (typeof SUPPORT_PRIORITIES)[number];
  status: SupportStatus;
  openedBy: Types.ObjectId;
  messages: ISupportMessage[];
  lastMessageAt: Date;
  closedAt?: Date;
}

export type SupportTicketDoc = HydratedDocument<ISupportTicket>;

const schema = new Schema<ISupportTicket>(
  {
    ref: { type: String, required: true, unique: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, enum: SUPPORT_CATEGORIES, default: "other" },
    priority: { type: String, enum: SUPPORT_PRIORITIES, default: "normal" },
    status: { type: String, enum: SUPPORT_STATUSES, default: "open" },
    openedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    messages: [
      {
        from: { type: String, enum: ["isp", "platform"], required: true },
        user: { type: Schema.Types.ObjectId, ref: "User" },
        platformUser: { type: Schema.Types.ObjectId, ref: "PlatformUser" },
        name: { type: String, required: true },
        text: { type: String, required: true, maxlength: 5000 },
        at: { type: Date, default: () => new Date() },
        _id: false,
      },
    ],
    lastMessageAt: { type: Date, default: () => new Date() },
    closedAt: Date,
  },
  { timestamps: true },
);

schema.plugin(tenantPlugin);
schema.index({ company: 1, lastMessageAt: -1, _id: -1 });
schema.index({ status: 1, lastMessageAt: -1 });

export const SupportTicket = model<ISupportTicket>("SupportTicket", schema);
