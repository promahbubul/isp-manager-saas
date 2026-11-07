import crypto from "crypto";
import { model, Schema, Types } from "mongoose";
import config from "../../config";

export interface IOtp {
  phone: string;
  purpose: "password_reset" | "portal_login";
  /** set for portal_login: the same number can be a customer of several ISPs */
  company?: Types.ObjectId;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  lastSentAt: Date;
}

const schema = new Schema<IOtp>({
  phone: { type: String, required: true },
  purpose: { type: String, enum: ["password_reset", "portal_login"], required: true },
  company: { type: Schema.Types.ObjectId, ref: "Company" },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  lastSentAt: { type: Date, required: true },
});
schema.index({ phone: 1, purpose: 1, company: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // MongoDB removes expired codes

export const Otp = model<IOtp>("Otp", schema);

/** Keyed hash so a database leak does not reveal live codes. */
export const hashOtp = (phone: string, code: string) =>
  crypto.createHmac("sha256", config.jwt.accessSecret).update(`${phone}:${code}`).digest("hex");

export const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
