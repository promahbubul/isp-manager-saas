import { z } from "zod";
import { money, objectId } from "../../utils/zod";

const speed = z.coerce.number().min(0).max(100_000);

export const createPackageSchema = z.object({
  name: z.string().trim().min(1).max(100),
  speedDown: speed,
  speedUp: speed,
  bdixSpeed: speed.optional(),
  price: money,
  validityDays: z.coerce.number().int().min(1).max(366).default(30),
  router: objectId,
  mikrotikProfile: z.string().trim().min(1).max(100),
});

export const updatePackageSchema = createPackageSchema
  .extend({ isActive: z.boolean(), validityDays: z.coerce.number().int().min(1).max(366) })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update");

export type CreatePackageInput = z.infer<typeof createPackageSchema>;
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;
