import { Types } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { objectId, optionalText } from "../../utils/zod";
import { Coupon } from "./coupon.model";

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/, "3-30 letters, numbers, - or _"),
    description: optionalText(200),
    type: z.enum(["percent", "fixed"]),
    value: z.coerce.number().positive(),
    plans: z.array(objectId).default([]),
    intervals: z.array(z.enum(["monthly", "yearly"])).min(1).default(["monthly", "yearly"]),
    maxUses: z.coerce.number().int().min(0).default(0),
    oncePerCompany: z.boolean().default(true),
    validFrom: z.coerce.date().optional(),
    validTo: z.coerce.date().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.type !== "percent" || d.value < 100, { path: ["value"], message: "Percent must be below 100" })
  .refine((d) => !d.validFrom || !d.validTo || d.validFrom < d.validTo, { path: ["validTo"], message: "End must be after start" });

export const couponUpdateSchema = z
  .object({
    description: optionalText(200),
    maxUses: z.coerce.number().int().min(0),
    validTo: z.coerce.date().nullable(),
    isActive: z.boolean(),
  })
  .partial();

type ApplyInput = {
  code: string;
  company: string | Types.ObjectId;
  plan: string | Types.ObjectId;
  interval: "monthly" | "yearly";
  currency: "BDT" | "USD";
  price: number;
};

/**
 * Check a code against a purchase. Returns the discount and final price, or throws
 * a 400 that explains why the code does not apply.
 */
export async function applyCoupon(input: ApplyInput) {
  const coupon = await Coupon.findOne({ code: input.code.trim().toUpperCase() });
  const now = new Date();
  if (!coupon || !coupon.isActive) throw new AppError(400, "Invalid coupon code");
  if (coupon.validFrom && coupon.validFrom > now) throw new AppError(400, "This coupon is not active yet");
  if (coupon.validTo && coupon.validTo < now) throw new AppError(400, "This coupon has expired");
  if (coupon.maxUses && coupon.used >= coupon.maxUses) throw new AppError(400, "This coupon has been fully used");
  if (coupon.plans.length && !coupon.plans.some((p) => String(p) === String(input.plan))) {
    throw new AppError(400, "This coupon does not apply to the selected plan");
  }
  if (!coupon.intervals.includes(input.interval)) throw new AppError(400, `This coupon is not valid for ${input.interval} billing`);
  if (coupon.oncePerCompany && coupon.usedBy.some((c) => String(c) === String(input.company))) {
    throw new AppError(400, "You have already used this coupon");
  }
  if (coupon.type === "fixed" && input.currency !== "BDT") throw new AppError(400, "This coupon applies to BDT payments only");

  const raw = coupon.type === "percent" ? (input.price * coupon.value) / 100 : coupon.value;
  const discount = Math.min(Math.round(raw * 100) / 100, input.price - 1); // something must still be paid
  if (discount <= 0) throw new AppError(400, "This coupon gives no discount on this plan");
  return { coupon, discount, finalPrice: Math.round((input.price - discount) * 100) / 100 };
}

/** Count a use once the payment succeeded (atomic, respects maxUses). */
export async function redeemCoupon(code: string, company: string | Types.ObjectId) {
  await Coupon.updateOne(
    { code, $or: [{ maxUses: 0 }, { $expr: { $lt: ["$used", "$maxUses"] } }] },
    { $inc: { used: 1 }, $addToSet: { usedBy: company } },
  );
}
