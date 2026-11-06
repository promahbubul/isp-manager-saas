import { z } from "zod";

const host = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(/^[a-zA-Z0-9.-]+$|^\[?[0-9a-fA-F:]+\]?$/, "Enter an IP address or hostname");

export const createRouterSchema = z.object({
  name: z.string().trim().min(1).max(100),
  host,
  port: z.coerce.number().int().min(1).max(65535).default(8728),
  useSSL: z.boolean().default(false),
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
  connectionMode: z.enum(["public", "vpn"]).default("public"),
});

export const updateRouterSchema = z
  .object({
    name: createRouterSchema.shape.name,
    host,
    port: z.coerce.number().int().min(1).max(65535),
    useSSL: z.boolean(),
    username: createRouterSchema.shape.username,
    /** omit to keep the current password */
    password: z.string().min(1).max(200),
    connectionMode: z.enum(["public", "vpn"]),
    isActive: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update");

export type CreateRouterInput = z.infer<typeof createRouterSchema>;
export type UpdateRouterInput = z.infer<typeof updateRouterSchema>;
