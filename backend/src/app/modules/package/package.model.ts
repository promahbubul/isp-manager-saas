import { HydratedDocument, model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

export interface IPackage {
  company: Types.ObjectId;
  name: string;
  /** Mbps */
  speedDown: number;
  speedUp: number;
  bdixSpeed?: number;
  price: number;
  validityDays: number;
  router: Types.ObjectId;
  /** PPP profile name on the MikroTik router */
  mikrotikProfile: string;
  isActive: boolean;
}

export type PackageDoc = HydratedDocument<IPackage>;

const packageSchema = new Schema<IPackage>(
  {
    name: { type: String, required: true, trim: true },
    speedDown: { type: Number, required: true, min: 0 },
    speedUp: { type: Number, required: true, min: 0 },
    bdixSpeed: { type: Number, min: 0 },
    price: { type: Number, required: true, min: 0 },
    validityDays: { type: Number, required: true, min: 1, default: 30 },
    router: { type: Schema.Types.ObjectId, ref: "Router", required: true },
    mikrotikProfile: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

packageSchema.plugin(tenantPlugin);
packageSchema.index({ company: 1, name: 1 }, { unique: true });

export const Package = model<IPackage>("Package", packageSchema);
