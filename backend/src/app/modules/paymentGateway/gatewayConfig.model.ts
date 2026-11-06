import { model, Schema, Types } from "mongoose";
import { GATEWAY_IDS, GatewayId } from "../../services/payment/gateway.types";

/**
 * One row per (owner, gateway).
 *   company = null  → the platform's own account (SaaS subscription, SMS credits) — managed by super admin
 *   company = <id>  → an ISP's merchant account (its customers' bills) — managed by the ISP admin
 * Not tenant-plugin scoped because platform rows have no company; always query with `company` explicitly.
 */
export interface IGatewayConfig {
  company: Types.ObjectId | null;
  gateway: GatewayId;
  enabled: boolean;
  sandbox: boolean;
  /** AES-GCM encrypted JSON of the credential fields */
  credentials?: string;
  /** shown to payers, e.g. "Send Money to 017XXXXXXXX (bKash personal)" — used by manual */
  instructions?: string;
}

const schema = new Schema<IGatewayConfig>(
  {
    company: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    gateway: { type: String, enum: GATEWAY_IDS, required: true },
    enabled: { type: Boolean, default: false },
    sandbox: { type: Boolean, default: true },
    credentials: { type: String, select: false },
    instructions: { type: String, maxlength: 1000 },
  },
  { timestamps: true },
);
schema.index({ company: 1, gateway: 1 }, { unique: true });

export const GatewayConfig = model<IGatewayConfig>("GatewayConfig", schema);
