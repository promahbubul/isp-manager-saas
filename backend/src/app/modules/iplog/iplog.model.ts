import { model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

/**
 * BTRC user log: who had which IP address and when. Built by polling each router's
 * active PPPoE sessions; a session is closed when it disappears or its IP changes.
 */
export interface IIpSession {
  company: Types.ObjectId;
  router: Types.ObjectId;
  customer?: Types.ObjectId;
  username: string;
  ip?: string;
  /** caller-id = the customer's router MAC address */
  mac?: string;
  startedAt: Date;
  lastSeenAt: Date;
  endedAt?: Date | null;
  /** RADIUS accounting session id and byte counters (RADIUS routers only) */
  acctSessionId?: string;
  bytesIn?: number;
  bytesOut?: number;
}

const schema = new Schema<IIpSession>(
  {
    router: { type: Schema.Types.ObjectId, ref: "Router", required: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer" },
    username: { type: String, required: true },
    ip: String,
    mac: String,
    startedAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    acctSessionId: String,
    bytesIn: Number,
    bytesOut: Number,
  },
  { timestamps: false },
);
schema.plugin(tenantPlugin);
schema.index({ company: 1, router: 1, endedAt: 1 });
schema.index({ router: 1, acctSessionId: 1 }, { sparse: true });
schema.index({ company: 1, startedAt: -1, _id: -1 });
schema.index({ company: 1, ip: 1, startedAt: -1 });
schema.index({ company: 1, username: 1, startedAt: -1 });

export const IpSession = model<IIpSession>("IpSession", schema);
