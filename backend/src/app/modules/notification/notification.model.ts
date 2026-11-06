import { model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

export interface INotification {
  company: Types.ObjectId;
  user: Types.ObjectId;
  title: string;
  body?: string;
  link?: string;
  isRead: boolean;
}

const schema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 500 },
    link: String,
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

schema.plugin(tenantPlugin);
schema.index({ company: 1, user: 1, isRead: 1, createdAt: -1 });
// keep 90 days
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export const Notification = model<INotification>("Notification", schema);
