import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import config from "./app/config";
import { globalErrorHandler } from "./app/middlewares/globalErrorHandler";
import { notFound } from "./app/middlewares/notFound";
import { apiLimiter } from "./app/middlewares/rateLimiter";
import routes from "./app/routes";
import fs from "node:fs";

const UPLOAD_DIR = config.uploadDir;
fs.mkdirSync(`${UPLOAD_DIR}/logos`, { recursive: true });

const app = express();

app.set("trust proxy", 1); // behind Nginx/Cloudflare
app.use(helmet());
app.use(cors({ origin: config.corsOrigins, credentials: true, exposedHeaders: ["Content-Disposition"] }));
app.use(cookieParser());
// Stripe verifies the webhook signature over the raw body, so it must be read before express.json().
app.use("/api/v1/pg/stripe/webhook", express.raw({ type: "application/json", limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

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
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, { maxAge: "7d", fallthrough: false, setHeaders: (res) => res.setHeader("Cross-Origin-Resource-Policy", "cross-origin") }),
);
app.use("/api/v1", apiLimiter, routes);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
