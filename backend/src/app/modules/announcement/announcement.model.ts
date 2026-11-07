import { model, Schema, Types } from "mongoose";

/** Banner shown on ISP dashboards (maintenance, new features, price changes). */
export interface IAnnouncement {
  title: string;
  body?: string;
  type: "info" | "warning" | "success";
  /** empty = every ISP; otherwise only ISPs on these plans */
  plans: Types.ObjectId[];
  startAt: Date;
  endAt?: Date;
  isActive: boolean;
}

const schema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: true, maxlength: 150 },
    body: { type: String, maxlength: 1000 },
    type: { type: String, enum: ["info", "warning", "success"], default: "info" },
    plans: [{ type: Schema.Types.ObjectId, ref: "Plan" }],
    startAt: { type: Date, default: () => new Date() },
    endAt: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
schema.index({ isActive: 1, startAt: 1, endAt: 1 });

export const Announcement = model<IAnnouncement>("Announcement", schema);
