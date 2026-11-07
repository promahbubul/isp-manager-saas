import { Server } from "http";
import app from "./app";
import config from "./app/config";
import { connectDB, disconnectDB } from "./app/config/db";
import { startJobs } from "./app/jobs";
import { syncAllPeers } from "./app/services/wireguard/wireguard.service";
import { markShuttingDown } from "./app/utils/lifecycle";
import { logger } from "./app/utils/logger";

let server: Server | undefined;
let stopJobs: (() => Promise<unknown>) | undefined;

async function bootstrap() {
  await connectDB();
  // WireGuard peers added at runtime vanish when wg0 restarts; put them back.
  await syncAllPeers()
    .then((n) => n && logger.info({ peers: n }, "WireGuard router peers synced"))
    .catch((e) => logger.error({ err: e }, "WireGuard peer sync failed"));
  server = app.listen(config.port, () => logger.info(`API running on http://localhost:${config.port} (${config.env})`));
  // keep-alive slightly above Nginx's so the proxy never reuses a closed socket
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  if (config.runJobs) stopJobs = startJobs();
}

let stopping = false;
/** Stop taking traffic, let in-flight requests finish (max 15 s), then close the DB. */
async function shutdown(signal: string, code = 0) {
  if (stopping) return;
  stopping = true;
  markShuttingDown();
  logger.info({ signal }, "shutting down");
  const force = setTimeout(() => {
    logger.warn("forced exit after 15s");
    process.exit(code || 1);
  }, 15_000);
  force.unref();
  await stopJobs?.().catch(() => undefined);
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await disconnectDB().catch(() => undefined);
  process.exit(code);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => {
  logger.fatal({ err }, "unhandled rejection");
  void shutdown("unhandledRejection", 1);
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception");
  void shutdown("uncaughtException", 1);
});

bootstrap().catch((err) => {
  logger.fatal({ err }, "failed to start");
  process.exit(1);
});
