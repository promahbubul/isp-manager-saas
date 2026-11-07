import { HydratedDocument, model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

export interface IRouter {
  company: Types.ObjectId;
  name: string;
  host: string;
  port: number;
  useSSL: boolean;
  username: string;
  /** AES-256-GCM encrypted — never returned by the API */
  password: string;
  connectionMode: "public" | "vpn";
  status: "unknown" | "online" | "offline";
  lastCheckedAt?: Date;
  lastError?: string;
  info?: { identity?: string; version?: string; board?: string };
  /** WireGuard tunnel (connectionMode "vpn"): the router dials the server, the API talks to `address` */
  vpn?: { publicKey: string; privateKey: string /* encrypted */; address: string; createdAt: Date };
  isActive: boolean;
}

export type RouterDoc = HydratedDocument<IRouter>;

const routerSchema = new Schema<IRouter>(
  {
    name: { type: String, required: true, trim: true },
    host: { type: String, required: true, trim: true },
    port: { type: Number, default: 8728 },
    useSSL: { type: Boolean, default: false },
    username: { type: String, required: true },
    password: { type: String, required: true, select: false },
    connectionMode: { type: String, enum: ["public", "vpn"], default: "public" },
    status: { type: String, enum: ["unknown", "online", "offline"], default: "unknown" },
    lastCheckedAt: Date,
    lastError: String,
    info: { identity: String, version: String, board: String },
    vpn: {
      publicKey: String,
      privateKey: { type: String, select: false },
      address: String,
      createdAt: Date,
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.password;
        if (ret.vpn && typeof ret.vpn === "object") delete (ret.vpn as Record<string, unknown>).privateKey;
        delete ret.__v;
        return ret;
      },
    },
  },
);

routerSchema.plugin(tenantPlugin);
routerSchema.index({ company: 1, name: 1 }, { unique: true });

export const MikrotikRouter = model<IRouter>("Router", routerSchema);
