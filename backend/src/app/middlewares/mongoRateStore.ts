import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";
import { model, Schema } from "mongoose";

/**
 * express-rate-limit store in MongoDB, so all PM2 instances share one counter per IP
 * (with the default memory store each instance counted separately: 2 instances = 2× limit).
 * Documents expire by themselves (TTL index on resetAt).
 */
const schema = new Schema(
  {
    _id: { type: String }, // "<prefix>:<key>"
    hits: { type: Number, default: 0 },
    resetAt: { type: Date, required: true },
  },
  { versionKey: false },
);
schema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });
const RateLimit = model("RateLimit", schema, "ratelimits");

export class MongoRateStore implements Store {
  private windowMs = 60_000;
  readonly localKeys = false;
  constructor(readonly prefix: string) {}

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const id = `${this.prefix}:${key}`;
    const now = Date.now();
    // Reset an expired window, then count this hit — one atomic update with a pipeline.
    const doc = await RateLimit.findOneAndUpdate(
      { _id: id },
      [
        {
          $set: {
            hits: { $cond: [{ $or: [{ $not: ["$resetAt"] }, { $lte: ["$resetAt", new Date(now)] }] }, 1, { $add: ["$hits", 1] }] },
            resetAt: { $cond: [{ $or: [{ $not: ["$resetAt"] }, { $lte: ["$resetAt", new Date(now)] }] }, new Date(now + this.windowMs), "$resetAt"] },
          },
        },
      ],
      { upsert: true, returnDocument: "after", updatePipeline: true },
    ).lean();
    return { totalHits: doc?.hits ?? 1, resetTime: doc?.resetAt ?? new Date(now + this.windowMs) };
  }

  async decrement(key: string) {
    await RateLimit.updateOne({ _id: `${this.prefix}:${key}`, hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }

  async resetKey(key: string) {
    await RateLimit.deleteOne({ _id: `${this.prefix}:${key}` });
  }
}
