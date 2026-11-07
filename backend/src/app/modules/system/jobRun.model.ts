import { model, Schema } from "mongoose";

/** Last run of each background job, written by the worker; shown on the system health page. */
export interface IJobRun {
  name: string;
  lastStartedAt?: Date;
  lastFinishedAt?: Date;
  lastDurationMs?: number;
  lastOk?: boolean;
  lastError?: string;
  lastResult?: unknown;
  lastSuccessAt?: Date;
  runs: number;
  failures: number;
}

const schema = new Schema<IJobRun>(
  {
    name: { type: String, required: true, unique: true },
    lastStartedAt: Date,
    lastFinishedAt: Date,
    lastDurationMs: Number,
    lastOk: Boolean,
    lastError: { type: String, maxlength: 1000 },
    lastResult: Schema.Types.Mixed,
    lastSuccessAt: Date,
    runs: { type: Number, default: 0 },
    failures: { type: Number, default: 0 },
  },
  { timestamps: false },
);

export const JobRun = model<IJobRun>("JobRun", schema);

/** Never throws: job bookkeeping must not break the job itself. */
export async function recordJobRun(name: string, startedAt: Date, outcome: { ok: true; result: unknown } | { ok: false; error: unknown }) {
  const finishedAt = new Date();
  const set: Record<string, unknown> = {
    lastStartedAt: startedAt,
    lastFinishedAt: finishedAt,
    lastDurationMs: finishedAt.getTime() - startedAt.getTime(),
    lastOk: outcome.ok,
  };
  if (outcome.ok) {
    set.lastResult = outcome.result ?? null;
    set.lastSuccessAt = finishedAt;
    set.lastError = null;
  } else {
    set.lastError = String(outcome.error instanceof Error ? outcome.error.message : outcome.error).slice(0, 1000);
  }
  await JobRun.updateOne({ name }, { $set: set, $inc: { runs: 1, failures: outcome.ok ? 0 : 1 } }, { upsert: true }).catch((err) =>
    console.error("[job] could not record run:", err),
  );
}
