import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import config from "./app/config";
import { globalErrorHandler } from "./app/middlewares/globalErrorHandler";
import { notFound } from "./app/middlewares/notFound";
import { apiLimiter } from "./app/middlewares/rateLimiter";
import { requestLogger, sanitizeInput } from "./app/middlewares/requestContext";
import { isShuttingDown } from "./app/utils/lifecycle";
import routes from "./app/routes";
import fs from "node:fs";

const UPLOAD_DIR = config.uploadDir;
fs.mkdirSync(`${UPLOAD_DIR}/logos`, { recursive: true });

const app = express();

app.set("trust proxy", config.trustProxy); // number of proxies in front (TRUST_PROXY)
app.disable("x-powered-by");
app.use(requestLogger);
app.use(helmet());
app.use(compression({ threshold: 1024 }));
app.use(cors({ origin: config.corsOrigins, credentials: true, exposedHeaders: ["Content-Disposition"] }));
app.use(cookieParser());
// Stripe verifies the webhook signature over the raw body, so it must be read before express.json().
app.use("/api/v1/pg/stripe/webhook", express.raw({ type: "application/json", limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(sanitizeInput);

/** Liveness: the process answers (PM2/systemd restart it otherwise). */
app.get("/api/v1/health/live", (_req, res) => {
  res.json({ success: true, message: "alive", data: { uptime: process.uptime() } });
});

/** Readiness: can serve traffic (DB reachable, not shutting down) — for the load balancer. */
app.get("/api/v1/health/ready", async (_req, res) => {
  let db = false;
  try {
    db = mongoose.connection.readyState === 1 && Boolean(await mongoose.connection.db!.admin().ping());
  } catch {
    db = false;
  }
  const ready = db && !isShuttingDown();
  res.status(ready ? 200 : 503).json({ success: ready, message: ready ? "ready" : isShuttingDown() ? "shutting down" : "database unavailable", data: { db: db ? "up" : "down" } });
});

// For uptime monitors / load balancers: 503 when MongoDB is not reachable.
app.get("/api/v1/health", async (_req, res) => {
  let db = "down";
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db!.admin().ping();
      db = "up";
    }
  } catch {
    db = "down";
  }
  res.status(db === "up" ? 200 : 503).json({ success: db === "up", message: db === "up" ? "OK" : "Database unavailable", data: { uptime: process.uptime(), db } });
});

// Uploaded logos. Nginx can serve this folder directly in production (see deploy/nginx).
// NID scans and ticket files live in /private and are only streamed by authenticated routes.
app.use("/uploads/private", (_req, res) => {
  res.status(404).end();
});
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, { maxAge: "7d", fallthrough: false, setHeaders: (res) => res.setHeader("Cross-Origin-Resource-Policy", "cross-origin") }),
);
app.use("/api/v1", apiLimiter, routes);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
