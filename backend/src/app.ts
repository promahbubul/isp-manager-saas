import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import config from "./app/config";
import { globalErrorHandler } from "./app/middlewares/globalErrorHandler";
import { notFound } from "./app/middlewares/notFound";
import { apiLimiter } from "./app/middlewares/rateLimiter";
import routes from "./app/routes";

const app = express();

app.set("trust proxy", 1); // behind Nginx/Cloudflare
app.use(helmet());
app.use(cors({ origin: config.corsOrigins, credentials: true, exposedHeaders: ["Content-Disposition"] }));
app.use(cookieParser());
// Stripe verifies the webhook signature over the raw body, so it must be read before express.json().
app.use("/api/v1/pg/stripe/webhook", express.raw({ type: "application/json", limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/v1/health", (_req, res) => {
  res.json({ success: true, message: "OK", data: { uptime: process.uptime() } });
});

app.use("/api/v1", apiLimiter, routes);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
