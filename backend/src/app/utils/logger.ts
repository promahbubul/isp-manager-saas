import pino from "pino";
import config from "../config";

/**
 * Structured JSON logs (one line per event) — easy to search with `pm2 logs` / Loki / any log tool.
 * Development prints them readable; tests are silent. Secrets are never written.
 */
export const logger = pino({
  level: config.isTest ? "silent" : (process.env.LOG_LEVEL ?? (config.isProd ? "info" : "debug")),
  base: { app: "isp-api", pid: process.pid },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-api-key"]',
      'req.headers["x-radius-secret"]',
      "*.password",
      "*.newPassword",
      "*.currentPassword",
      "*.token",
      "*.accessToken",
      "*.apiKey",
      "*.secret",
    ],
    censor: "[redacted]",
  },
  ...(config.isProd || config.isTest ? {} : { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,app" } } }),
});
