import { z } from "zod";
import { money, objectId, optionalText } from "../../utils/zod";
import { bdPhone } from "../auth/auth.validation";

const pppoeUsername = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z0-9._@-]+$/, "Letters, numbers and . _ @ - only");

const pppoePassword = z
  .string()
  .min(4)
  .max(64)
  .regex(/^[\x21-\x7e]+$/, "No spaces or special unicode characters");

const date = z.coerce.date();

const base = {
  name: z.string().trim().min(2).max(100),
  phone: bdPhone,
  altPhone: bdPhone.optional(),
  email: z.email().trim().toLowerCase().optional(),
  nid: optionalText(30),
  address: optionalText(300),
  zone: objectId.optional(),
  connectionType: z.enum(["pppoe", "static", "hotspot"]).default("pppoe"),
  pppoeUsername,
  /** generated if omitted */
  pppoePassword: pppoePassword.optional(),
  staticIp: optionalText(45),
  macAddress: optionalText(30),
  package: objectId,
  /** defaults to the package price */
  monthlyFee: money.optional(),
  discount: money.default(0),
  /** existing customers being migrated: set their current expiry. Default: today (must recharge). */
  expiryDate: date.optional(),
  /** free customers never expire (staff, VIP) */
  isFree: z.boolean().default(false),
  autoDisable: z.boolean().default(true),
  /** prepaid = pay first, valid until expiry; postpaid = monthly invoice, pay after use */
  billingType: z.enum(["prepaid", "postpaid"]).default("prepaid"),
  /** put the customer under a reseller (ignored when a reseller creates it: always theirs) */
  reseller: objectId.optional(),
  connectionDate: date.optional(),
  dueAmount: money.default(0),
  device: z
    .object({ onuMac: optionalText(30), boxNo: optionalText(30), port: optionalText(30) })
    .optional(),
  note: optionalText(1000),
};

export const createCustomerSchema = z.object(base);

export const updateCustomerSchema = z
  .object({
    name: base.name,
    phone: base.phone,
    altPhone: bdPhone.nullable(),
    email: z.email().trim().toLowerCase().nullable(),
    nid: base.nid,
    address: base.address,
    zone: objectId.nullable(),
    connectionType: z.enum(["pppoe", "static", "hotspot"]),
    pppoeUsername,
    pppoePassword,
    staticIp: base.staticIp,
    macAddress: base.macAddress,
    package: objectId,
    monthlyFee: money,
    discount: money,
    expiryDate: date,
    isFree: z.boolean(),
    autoDisable: z.boolean(),
    billingType: z.enum(["prepaid", "postpaid"]),
    reseller: objectId.nullable(),
    device: base.device,
    note: base.note,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update");

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
