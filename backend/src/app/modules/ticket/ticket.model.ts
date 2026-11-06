import { HydratedDocument, model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

export const TICKET_CATEGORIES = ["no_internet", "slow_speed", "fiber_cut", "router_issue", "billing", "new_connection", "other"] as const;
export const TICKET_STATUSES = ["open", "in_progress", "solved", "closed"] as const;
export const TICKET_PRIORITIES = ["low", "medium", "high"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface ITicket {
  company: Types.ObjectId;
  ticketNo: string;
  customer?: Types.ObjectId;
  category: (typeof TICKET_CATEGORIES)[number];
  subject: string;
  description?: string;
  priority: (typeof TICKET_PRIORITIES)[number];
  source: "office" | "phone" | "portal";
  status: TicketStatus;
  assignedTo?: Types.ObjectId | null;
  createdBy?: Types.ObjectId;
  comments: { by?: Types.ObjectId; text: string; at: Date; system?: boolean }[];
  solvedAt?: Date;
}

export type TicketDoc = HydratedDocument<ITicket>;

const schema = new Schema<ITicket>(
  {
    ticketNo: { type: String, required: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer" },
    category: { type: String, enum: TICKET_CATEGORIES, default: "other" },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 2000 },
    priority: { type: String, enum: TICKET_PRIORITIES, default: "medium" },
    source: { type: String, enum: ["office", "phone", "portal"], default: "office" },
    status: { type: String, enum: TICKET_STATUSES, default: "open" },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    comments: [
      {
        by: { type: Schema.Types.ObjectId, ref: "User" },
        text: { type: String, required: true, maxlength: 2000 },
        at: { type: Date, default: () => new Date() },
        system: Boolean,
        _id: false,
      },
    ],
    solvedAt: Date,
  },
  { timestamps: true },
);

schema.plugin(tenantPlugin);
schema.index({ company: 1, ticketNo: 1 }, { unique: true });
schema.index({ company: 1, status: 1, createdAt: -1 });
schema.index({ company: 1, assignedTo: 1, status: 1 });
schema.index({ company: 1, customer: 1, createdAt: -1 });

export const Ticket = model<ITicket>("Ticket", schema);
