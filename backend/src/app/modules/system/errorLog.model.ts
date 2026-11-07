import { model, Schema, Types } from "mongoose";

/** Unexpected (5xx) errors, kept 30 days for the super admin's error log. */
export interface IErrorLog {
  message: string;
  stack?: string;
  method?: string;
  path?: string;
  status: number;
  company?: Types.ObjectId;
  user?: string;
  count: number;
  firstAt: Date;
  lastAt: Date;
  /** same message + path = same problem: counted, not duplicated */
  fingerprint: string;
}

const schema = new Schema<IErrorLog>(
  {
    message: { type: String, required: true, maxlength: 1000 },
    stack: { type: String, maxlength: 6000 },
    method: String,
    path: { type: String, maxlength: 300 },
    status: { type: Number, default: 500 },
    company: { type: Schema.Types.ObjectId, ref: "Company" },
    user: String,
    count: { type: Number, default: 1 },
    firstAt: { type: Date, default: () => new Date() },
    lastAt: { type: Date, default: () => new Date() },
    fingerprint: { type: String, required: true, unique: true },
  },
  { timestamps: false },
);
schema.index({ lastAt: 1 }, { expireAfterSeconds: 30 * 86_400 });

export const ErrorLog = model<IErrorLog>("ErrorLog", schema);

/** Never throws — logging must not cause a second error. */
export function recordError(err: unknown, ctx: { method?: string; path?: string; status: number; company?: string; user?: string }) {
  const e = err as { message?: string; stack?: string };
  const message = String(e?.message ?? err).slice(0, 1000);
  // ids and numbers vary per request; strip them so the same bug groups together
  const path = (ctx.path ?? "").split("?")[0].replace(/[0-9a-f]{24}/gi, ":id").slice(0, 300);
  const fingerprint = `${ctx.method} ${path} ${message.replace(/\d+/g, "#").slice(0, 200)}`;
  return ErrorLog.updateOne(
    { fingerprint },
    {
      $set: { lastAt: new Date(), stack: e?.stack?.slice(0, 6000), status: ctx.status, company: ctx.company, user: ctx.user },
      $setOnInsert: { message, method: ctx.method, path, firstAt: new Date() },
      $inc: { count: 1 },
    },
    { upsert: true },
  ).catch(() => undefined);
}
