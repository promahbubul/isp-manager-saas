import { z } from "zod";

// Mirrors backend/src/app/modules/auth/auth.validation.ts
export const bdPhone = z
  .string()
  .trim()
  .regex(/^(?:\+?88)?01[3-9]\d{8}$/, "Enter a valid Bangladeshi mobile number");

export const password = z
  .string()
  .min(8, "At least 8 characters")
  .regex(/[A-Za-z]/, "Must contain a letter")
  .regex(/\d/, "Must contain a number");

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your phone or email"),
  password: z.string().min(1, "Enter your password"),
  companySlug: z.string().optional(),
});

export const signupSchema = z
  .object({
    companyName: z.string().trim().min(2, "Company name is required"),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/, "3-32 chars: lowercase letters, numbers, hyphens"),
    ownerName: z.string().trim().min(2, "Your name is required"),
    phone: bdPhone,
    email: z.email("Enter a valid email"),
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

/** "Speed Net BD" -> "speed-net-bd" */
export const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
