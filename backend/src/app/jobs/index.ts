import cron from "node-cron";
import { expireCustomers } from "./expireCustomers.job";
import { sendExpiryReminders } from "./expiryReminder.job";
import { retryFailedSyncs } from "./retrySync.job";
import { runSubscriptionLifecycle } from "./subscriptionLifecycle.job";

type Job = { name: string; schedule: string; run: () => Promise<unknown> };

const JOBS: Job[] = [
  { name: "expireCustomers", schedule: "*/15 * * * *", run: () => expireCustomers() },
  { name: "retryFailedSyncs", schedule: "*/10 * * * *", run: retryFailedSyncs },
  { name: "expiryReminders", schedule: "0 10 * * *", run: () => sendExpiryReminders() }, // 10:00 Dhaka
  { name: "subscriptionLifecycle", schedule: "5 * * * *", run: () => runSubscriptionLifecycle() },
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
        const started = Date.now();
        try {
          const result = await job.run();
          console.log(`[job] ${job.name} done in ${Date.now() - started}ms`, result);
        } catch (err) {
          console.error(`[job] ${job.name} failed:`, err);
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
