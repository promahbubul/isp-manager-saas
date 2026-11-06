import { z } from "zod";
import { RESERVED_SLUGS } from "../../constants/roles";
import { normalizeBdPhone } from "../../utils/phone";

export const bdPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const phone = normalizeBdPhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Invalid Bangladeshi mobile number" });
      return z.NEVER;
    }
    return phone;
  });

export const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

export const signupSchema = z.object({
  companyName: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/, "3-32 chars: lowercase letters, numbers and hyphens")
    .refine((s) => !RESERVED_SLUGS.includes(s), "This subdomain is reserved"),
  ownerName: z.string().trim().min(2).max(100),
  phone: bdPhone,
  email: z.email().trim().toLowerCase(),
  password,
});

export const loginSchema = z.object({
  /** email or phone */
  identifier: z.string().trim().min(3),
  password: z.string().min(1),
  /** required only when the same email/phone belongs to several companies */
  companySlug: z.string().trim().toLowerCase().optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: password,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    path: ["newPassword"],
    message: "New password must be different",
  });

export const platformLoginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;
