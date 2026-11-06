import { ClientSession, model, Schema, Types } from "mongoose";

interface ICounter {
  company: Types.ObjectId;
  key: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  company: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  key: { type: String, required: true },
  seq: { type: Number, default: 0 },
});
counterSchema.index({ company: 1, key: 1 }, { unique: true });

export const Counter = model<ICounter>("Counter", counterSchema);

const PREFIX: Record<string, string> = { customer: "C", receipt: "R", invoice: "INV", ticket: "T" };

/** Atomic per-company sequence → "C-00001", "R-00042" ... */
export async function nextSequence(company: string | Types.ObjectId, key: string, session?: ClientSession) {
  const doc = await Counter.findOneAndUpdate(
    { company, key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", session },
  );
  if (!doc) throw new Error("Counter upsert failed");
  const prefix = PREFIX[key] ?? key.toUpperCase();
  return `${prefix}-${String(doc.seq).padStart(5, "0")}`;
}
