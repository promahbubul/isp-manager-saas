/**
 * Background worker: runs the cron jobs (auto-expire, sync retry, reminders,
 * subscription lifecycle) without serving HTTP.
 *
 * Production layout (see deploy/ecosystem.config.js):
 *   isp-api    × N  → server.ts with RUN_JOBS=false
 *   isp-worker × 1  → this file
 */
import { connectDB, disconnectDB } from "./app/config/db";
import { startJobs } from "./app/jobs";

let stopJobs: (() => Promise<unknown>) | undefined;

async function main() {
  await connectDB();
  stopJobs = startJobs();
  console.log("👷 Worker started");
}

async function shutdown(signal: string, code = 0) {
  console.log(`${signal} received, stopping worker...`);
  await stopJobs?.().catch(() => undefined);
  await disconnectDB().catch(() => undefined);
  process.exit(code);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection in worker:", err);
});

main().catch((err) => {
  console.error("❌ Worker failed to start:", err);
  process.exit(1);
});
