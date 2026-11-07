import rateLimit from "express-rate-limit";
import config from "../config";
import { MongoRateStore } from "./mongoRateStore";

/** Counters live in MongoDB so every API instance (PM2 cluster) shares them. */
const store = (prefix: string) => (config.isTest ? undefined : new MongoRateStore(prefix));

/** Brute-force protection for login / signup / password endpoints. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: store("auth"),
  skip: () => config.isTest,
  message: { success: false, message: "Too many attempts. Please try again in 15 minutes." },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: store("api"),
  // FreeRADIUS on localhost sends every PPPoE login/accounting packet; it has its own secret.
  skip: (req) => config.isTest || req.path.startsWith("/radius/"),
  // a DB hiccup must not take the whole API down with it
  passOnStoreError: true,
});
