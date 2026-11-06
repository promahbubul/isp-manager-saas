import { isValidObjectId } from "mongoose";
import { z } from "zod";

export const objectId = z.string().trim().refine((v) => isValidObjectId(v), "Invalid id");

/** Taka amount: non-negative, max 2 decimals. */
export const money = z.coerce
  .number()
  .min(0, "Amount cannot be negative")
  .max(10_000_000)
  .refine((v) => Math.round(v * 100) === v * 100, "Max 2 decimal places");

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));
