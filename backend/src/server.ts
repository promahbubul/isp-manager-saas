import { Server } from "http";
import app from "./app";
import config from "./app/config";
import { connectDB, disconnectDB } from "./app/config/db";
import { startJobs } from "./app/jobs";

let server: Server | undefined;
let stopJobs: (() => Promise<unknown>) | undefined;

async function bootstrap() {
  await connectDB();
  server = app.listen(config.port, () => {
    console.log(`🚀 API running on http://localhost:${config.port} (${config.env})`);
  });
  if (config.runJobs) stopJobs = startJobs();
}

async function shutdown(signal: string, code = 0) {
  console.log(`${signal} received, shutting down...`);
  await stopJobs?.().catch(() => undefined);
  server?.close();
  await disconnectDB().catch(() => undefined);
  process.exit(code);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
  void shutdown("unhandledRejection", 1);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  void shutdown("uncaughtException", 1);
});

bootstrap().catch((err) => {
  console.error("❌ Failed to start:", err);
  process.exit(1);
});
