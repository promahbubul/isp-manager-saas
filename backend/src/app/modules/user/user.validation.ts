import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { ALL_PERMISSIONS, Permission } from "../../constants/permissions";
import { ASSIGNABLE_ROLES } from "../../constants/roles";
import { bdPhone, password } from "../auth/auth.validation";

const objectId = z.string().refine((v) => isValidObjectId(v), "Invalid id");
const permission = z.string().refine((p) => ALL_PERMISSIONS.includes(p as Permission), "Unknown permission");

const base = {
  name: z.string().trim().min(2).max(100),
  phone: bdPhone,
  email: z.email().trim().toLowerCase().optional(),
  role: z.enum(ASSIGNABLE_ROLES),
  permissions: z.array(permission).default([]),
  zones: z.array(objectId).default([]),
};

export const createUserSchema = z
  .object({ ...base, password })
  .refine((d) => d.role !== "custom" || d.permissions.length > 0, {
    path: ["permissions"],
    message: "A custom role needs at least one permission",
  });

export const updateUserSchema = z
  .object({
    name: base.name,
    phone: base.phone,
    email: base.email,
    role: base.role,
    permissions: z.array(permission),
    zones: z.array(objectId),
    isActive: z.boolean(),
    password,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update");

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
