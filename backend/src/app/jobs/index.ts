import cron from "node-cron";
import { recordJobRun } from "../modules/system/jobRun.model";
import { expireCustomers } from "./expireCustomers.job";
import { sendExpiryReminders } from "./expiryReminder.job";
import { retryFailedSyncs } from "./retrySync.job";
import { runSubscriptionLifecycle } from "./subscriptionLifecycle.job";
import { issueInvoicesForAll } from "../modules/invoice/invoice.service";
import { pollIpSessions } from "../modules/iplog/iplog.service";
import { sendDailySummaries } from "./dailySummary.job";
import { pollAllOlts } from "../modules/olt/olt";

/** maxGapMinutes: health page flags the job as stale when its last run is older than this. */
type Job = { name: string; schedule: string; maxGapMinutes: number; run: () => Promise<unknown> };

export const JOBS: Job[] = [
  { name: "expireCustomers", schedule: "*/15 * * * *", maxGapMinutes: 45, run: () => expireCustomers() },
  { name: "retryFailedSyncs", schedule: "*/10 * * * *", maxGapMinutes: 30, run: retryFailedSyncs },
  { name: "expiryReminders", schedule: "0 10 * * *", maxGapMinutes: 26 * 60, run: () => sendExpiryReminders() }, // 10:00 Dhaka
  { name: "subscriptionLifecycle", schedule: "5 * * * *", maxGapMinutes: 90, run: () => runSubscriptionLifecycle() },
  // 00:10 on the 1st; daily re-runs are no-ops but catch a missed 1st (server down).
  { name: "postpaidInvoices", schedule: "10 0 * * *", maxGapMinutes: 26 * 60, run: () => issueInvoicesForAll() },
  // BTRC user/IP log; only ISPs whose plan has ip_log are polled.
  { name: "dailySummaryEmail", schedule: "0 21 * * *", maxGapMinutes: 26 * 60, run: () => sendDailySummaries() }, // 21:00 Dhaka
  { name: "oltSignalPoll", schedule: "*/30 * * * *", maxGapMinutes: 90, run: () => pollAllOlts() },
  { name: "ipLogPoll", schedule: "*/5 * * * *", maxGapMinutes: 20, run: () => pollIpSessions() },
];

/**
 * In-process scheduler (node-cron). Run it in ONE process only (RUN_JOBS=true),
 * otherwise jobs would execute once per API instance. Moves to BullMQ + Redis later.
 */
export function startJobs() {
  const tasks = JOBS.map((job) => {
    let running = false;
    return cron.schedule(
      job.schedule,
      async () => {
        if (running) return; // skip overlapping runs
        running = true;
        const started = new Date();
        try {
          const result = await job.run();
          console.log(`[job] ${job.name} done in ${Date.now() - started.getTime()}ms`, result);
          await recordJobRun(job.name, started, { ok: true, result });
        } catch (err) {
          console.error(`[job] ${job.name} failed:`, err);
          await recordJobRun(job.name, started, { ok: false, error: err });
        } finally {
          running = false;
        }
      },
      { name: job.name, timezone: "Asia/Dhaka" },
    );
  });
  console.log(`⏱️  ${tasks.length} background jobs scheduled`);
  return () => Promise.all(tasks.map((t) => t.stop()));
}
