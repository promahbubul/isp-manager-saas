import { model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

export interface ISetting {
  company: Types.ObjectId;
  billing: {
    /** days after expiry before the connection is disabled */
    graceDays: number;
    /** master switch for the auto-disable job */
    autoDisable: boolean;
  };
  receipt: { header?: string; footer?: string };
  sms: {
    /** which events send an SMS automatically */
    autoEvents: {
      welcome: boolean;
      payment_success: boolean;
      expiry_reminder: boolean;
      expired: boolean;
      ticket_update: boolean;
    };
    /** expiry reminder goes out this many days before expiry */
    reminderDaysBefore: number;
  };
}

const on = { type: Boolean, default: true };

const settingSchema = new Schema<ISetting>(
  {
    billing: {
      graceDays: { type: Number, default: 0, min: 0, max: 30 },
      autoDisable: { type: Boolean, default: true },
    },
    receipt: { header: String, footer: String },
    sms: {
      autoEvents: {
        welcome: on,
        payment_success: on,
        expiry_reminder: on,
        expired: on,
        ticket_update: on,
      },
      reminderDaysBefore: { type: Number, default: 3, min: 1, max: 10 },
    },
  },
  { timestamps: true },
);

settingSchema.plugin(tenantPlugin, { index: false });
settingSchema.index({ company: 1 }, { unique: true });

export const Setting = model<ISetting>("Setting", settingSchema);

/** Settings document for a company, created with defaults on first access. */
export async function getSettings(company: string | Types.ObjectId) {
  return Setting.findOneAndUpdate(
    { company },
    { $setOnInsert: { company } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).orFail();
}
