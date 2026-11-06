import { model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

export interface IActivityLog {
  company: Types.ObjectId;
  user?: Types.ObjectId;
  /** e.g. "customer.create", "payment.recharge" */
  action: string;
  entity: string;
  entityId?: string;
  summary?: string;
  ip?: string;
  userAgent?: string;
}

const schema = new Schema<IActivityLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: String,
    summary: { type: String, maxlength: 500 },
    ip: String,
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

schema.plugin(tenantPlugin);
schema.index({ company: 1, createdAt: -1 });
schema.index({ company: 1, entity: 1, entityId: 1, createdAt: -1 });
schema.index({ company: 1, user: 1, createdAt: -1 });

export const ActivityLog = model<IActivityLog>("ActivityLog", schema);
