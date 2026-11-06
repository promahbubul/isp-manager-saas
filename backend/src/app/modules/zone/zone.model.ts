import { model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

export interface IZone {
  company: Types.ObjectId;
  name: string;
  parent?: Types.ObjectId | null;
  note?: string;
  isActive: boolean;
}

const zoneSchema = new Schema<IZone>(
  {
    name: { type: String, required: true, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: "Zone", default: null },
    note: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

zoneSchema.plugin(tenantPlugin);
zoneSchema.index({ company: 1, parent: 1, name: 1 }, { unique: true });

export const Zone = model<IZone>("Zone", zoneSchema);
