import crypto from "node:crypto";
import { NextFunction, Request, Response } from "express";
import pinoHttp from "pino-http";
import { logger } from "../utils/logger";

/**
 * Every request gets an id (X-Request-Id: reused from Nginx/the client, or generated),
 * returned in the response header and attached to every log line, so a user's
 * "it failed" can be matched to the exact server log.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers["x-request-id"];
    const id = typeof incoming === "string" && /^[\w.-]{8,100}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  autoLogging: { ignore: (req) => req.url?.startsWith("/api/v1/health") ?? false },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
  customSuccessMessage: (req, res, ms) => `${req.method} ${req.url} ${res.statusCode} ${Math.round(ms)}ms`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

/** True for keys that would act as MongoDB operators or path traversal ($gt, a.b). */
const dangerous = (k: string) => k.startsWith("$") || k.includes(".") || k === "__proto__" || k === "constructor" || k === "prototype";

function clean(value: unknown, depth = 0): unknown {
  if (depth > 20 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  if (Buffer.isBuffer(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!dangerous(k)) out[k] = clean(v, depth + 1);
  }
  return out;
}

/**
 * NoSQL-injection guard: drops `$`-operators and dotted keys from query strings and JSON
 * bodies (e.g. ?status[$ne]=x or {"phone":{"$gt":""}}). Zod validates most bodies too;
 * this also covers list filters built from req.query.
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  // Express 5: req.query is a getter, so replace it with the cleaned copy.
  Object.defineProperty(req, "query", { value: clean(req.query), writable: true, configurable: true, enumerable: true });
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) req.body = clean(req.body);
  next();
}
