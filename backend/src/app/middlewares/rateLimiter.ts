import rateLimit from "express-rate-limit";
import config from "../config";

/** Brute-force protection for login / signup / password endpoints. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { success: false, message: "Too many attempts. Please try again in 15 minutes." },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => config.isTest,
});
