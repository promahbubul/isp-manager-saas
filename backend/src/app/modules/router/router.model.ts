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
  /**
   * secret — PPPoE users are written to the router (/ppp secret)
   * radius — the router asks our FreeRADIUS, which asks this API (nothing stored on the router)
   */
  authMode: "secret" | "radius";
  radius?: {
    /** NAS-IP-Address the router sends; defaults to `host` */
    nasIp?: string;
    /** IP pool name for expired customers (they get a "please pay" page); empty = reject */
    expiredPool?: string;
    /** shared secret with FreeRADIUS (encrypted) */
    secret?: string;
  };
  status: "unknown" | "online" | "offline";
  lastCheckedAt?: Date;
  lastError?: string;
  info?: { identity?: string; version?: string; board?: string };
  /** WireGuard tunnel (connectionMode "vpn"): the router dials the server, the API talks to `address` */
  vpn?: { type?: "wireguard" | "sstp"; publicKey?: string; privateKey?: string /* encrypted */; sstpUser?: string; sstpPassword?: string /* encrypted */; address: string; createdAt: Date };
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
    authMode: { type: String, enum: ["secret", "radius"], default: "secret" },
    radius: { nasIp: String, expiredPool: String, secret: { type: String, select: false } },
    status: { type: String, enum: ["unknown", "online", "offline"], default: "unknown" },
    lastCheckedAt: Date,
    lastError: String,
    info: { identity: String, version: String, board: String },
    vpn: {
      type: { type: String, enum: ["wireguard", "sstp"], default: "wireguard" },
      publicKey: String,
      privateKey: { type: String, select: false },
      sstpUser: String,
      sstpPassword: { type: String, select: false },
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
        if (ret.vpn && typeof ret.vpn === "object") {
          delete (ret.vpn as Record<string, unknown>).privateKey;
          delete (ret.vpn as Record<string, unknown>).sstpPassword;
        }
        if (ret.radius && typeof ret.radius === "object") delete (ret.radius as Record<string, unknown>).secret;
        delete ret.__v;
        return ret;
      },
    },
  },
);

routerSchema.plugin(tenantPlugin);
routerSchema.index({ company: 1, name: 1 }, { unique: true });
routerSchema.index({ authMode: 1, host: 1 });
routerSchema.index({ authMode: 1, "radius.nasIp": 1 });

export const MikrotikRouter = model<IRouter>("Router", routerSchema);
