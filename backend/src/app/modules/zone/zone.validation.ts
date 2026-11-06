import { z } from "zod";
import { objectId, optionalText } from "../../utils/zod";

export const createZoneSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parent: objectId.nullish(),
  note: optionalText(),
});

export const updateZoneSchema = createZoneSchema
  .extend({ isActive: z.boolean() })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update");

export type CreateZoneInput = z.infer<typeof createZoneSchema>;
export type UpdateZoneInput = z.infer<typeof updateZoneSchema>;
