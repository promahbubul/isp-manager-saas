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
  comments: { by?: Types.ObjectId; text: string; at: Date; system?: boolean; fromCustomer?: boolean }[];
  /** photos/PDFs (private files) */
  attachments: { file: string; name: string; size: number; at: Date; fromCustomer?: boolean }[];
  /** SLA deadline: created + settings.ticket.slaHours[priority] */
  dueBy?: Date;
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
        /** written by the customer in the self-care portal */
        fromCustomer: Boolean,
        _id: false,
      },
    ],
    attachments: [{ file: String, name: String, size: Number, at: { type: Date, default: () => new Date() }, fromCustomer: Boolean, _id: false }],
    dueBy: Date,
    solvedAt: Date,
  },
  { timestamps: true },
);

schema.plugin(tenantPlugin);

// SLA deadline from the company's settings (set once, when the ticket is created).
schema.pre("validate", async function () {
  if (!this.isNew || this.dueBy || !this.company) return;
  const { getSettings } = await import("../setting/setting.model");
  const s = await getSettings(this.company);
  const hours = s.ticket?.slaHours?.[this.priority] ?? 24;
  this.dueBy = new Date(Date.now() + hours * 3_600_000);
});
schema.index({ company: 1, ticketNo: 1 }, { unique: true });
schema.index({ company: 1, createdAt: -1, _id: -1 }); // default list order (cursor pagination)
schema.index({ company: 1, status: 1, createdAt: -1 });
schema.index({ company: 1, assignedTo: 1, status: 1 });
schema.index({ company: 1, customer: 1, createdAt: -1 });

export const Ticket = model<ITicket>("Ticket", schema);
