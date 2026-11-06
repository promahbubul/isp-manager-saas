import { z } from "zod";
import { money, objectId, optionalText } from "../../utils/zod";
import { PAYMENT_METHODS } from "./payment.model";

export const rechargeSchema = z
  .object({
    customer: objectId,
    months: z.coerce.number().int().min(1).max(24).default(1),
    /** cash received now; defaults to the full bill */
    amount: money.optional(),
    /** one-off discount on this recharge */
    discount: money.default(0),
    method: z.enum(PAYMENT_METHODS).default("cash"),
    trxId: optionalText(60),
    note: optionalText(500),
  })
  .refine((d) => d.method === "cash" || d.method === "bank" || d.trxId, {
    path: ["trxId"],
    message: "Transaction ID is required for mobile/online payments",
  });

export type RechargeInput = z.infer<typeof rechargeSchema>;
