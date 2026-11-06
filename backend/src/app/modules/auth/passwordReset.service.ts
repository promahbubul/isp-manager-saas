import crypto from "crypto";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { getSmsProvider } from "../../services/sms/sms.provider";
import { normalizeBdPhone } from "../../utils/phone";
import { Company } from "../company/company.model";
import { User } from "../user/user.model";
import { generateOtp, hashOtp, Otp } from "./otp.model";
import { password } from "./auth.validation";

const CODE_TTL_MS = 10 * 60_000;
const RESEND_AFTER_MS = 60_000;
const MAX_ATTEMPTS = 5;

export const forgotSchema = z.object({ identifier: z.string().trim().min(3) });
export const resetSchema = z.object({
  identifier: z.string().trim().min(3),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
  newPassword: password,
  companySlug: z.string().trim().toLowerCase().optional(),
});

/** phone or email → the registered phone number (null if nobody matches). */
async function resolvePhone(identifier: string): Promise<string | null> {
  const phone = normalizeBdPhone(identifier);
  if (phone) return (await User.exists({ phone, isActive: true })) ? phone : null;
  const user = await User.findOne({ email: identifier.toLowerCase(), isActive: true }).select("phone");
  return user?.phone ?? null;
}

const mask = (phone: string) => `${phone.slice(0, 3)}*****${phone.slice(-3)}`;

/**
 * Send a 6-digit reset code by SMS. Always answers the same way so the endpoint
 * cannot be used to discover which accounts exist. The SMS is paid by the
 * platform (not the ISP's SMS wallet).
 */
export async function requestPasswordReset(identifier: string) {
  const generic = { message: "If an account exists, a 6-digit code has been sent by SMS." };
  const phone = await resolvePhone(identifier);
  if (!phone) return { ...generic, sentTo: undefined };

  const existing = await Otp.findOne({ phone, purpose: "password_reset" });
  if (existing && Date.now() - existing.lastSentAt.getTime() < RESEND_AFTER_MS) {
    throw new AppError(429, "Please wait a minute before requesting another code");
  }

  const code = generateOtp();
  await Otp.findOneAndUpdate(
    { phone, purpose: "password_reset" },
    { $set: { codeHash: hashOtp(phone, code), attempts: 0, expiresAt: new Date(Date.now() + CODE_TTL_MS), lastSentAt: new Date() } },
    { upsert: true },
  );
  const result = await getSmsProvider().send(phone, `Your password reset code is ${code}. It expires in 10 minutes. Do not share it.`);
  if (!result.ok) console.error("[password-reset] SMS failed:", result.error);
  return { ...generic, sentTo: mask(phone) };
}

export async function resetPassword(input: z.infer<typeof resetSchema>) {
  const phone = await resolvePhone(input.identifier);
  const otp = phone ? await Otp.findOne({ phone, purpose: "password_reset" }) : null;
  if (!phone || !otp || otp.expiresAt < new Date()) throw new AppError(400, "The code is invalid or has expired");
  if (otp.attempts >= MAX_ATTEMPTS) throw new AppError(429, "Too many wrong codes. Request a new one.");

  const ok = crypto.timingSafeEqual(Buffer.from(otp.codeHash), Buffer.from(hashOtp(phone, input.code)));
  if (!ok) {
    await Otp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    throw new AppError(400, "The code is invalid or has expired");
  }

  // The same phone may be staff at more than one ISP.
  let users = await User.find({ phone, isActive: true });
  if (input.companySlug) {
    const company = await Company.findOne({ slug: input.companySlug }).select("_id");
    users = company ? users.filter((u) => String(u.company) === company.id) : [];
  }
  if (users.length === 0) throw new AppError(400, "No active account found");
  if (users.length > 1) {
    const companies = await Company.find({ _id: { $in: users.map((u) => u.company) } }).select("name slug");
    throw new AppError(409, "This number belongs to multiple companies. Select one.", {
      companies: companies.map((c) => ({ name: c.name, slug: c.slug })),
    });
  }

  const user = users[0];
  user.password = input.newPassword;
  user.tokenVersion += 1; // log out every session
  await user.save();
  await Otp.deleteOne({ _id: otp._id });
  return { message: "Password changed. You can log in now." };
}

