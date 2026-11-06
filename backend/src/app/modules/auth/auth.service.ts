import mongoose from "mongoose";
import config from "../../config";
import { resolvePermissions } from "../../constants/permissions";
import AppError from "../../errors/AppError";
import { addDays } from "../../utils/duration";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt";
import { normalizeBdPhone } from "../../utils/phone";
import { Company, CompanyDoc } from "../company/company.model";
import { Plan } from "../plan/plan.model";
import { PlatformUser, PlatformUserDoc } from "../platformUser/platformUser.model";
import { Subscription } from "../subscription/subscription.model";
import { User, UserDoc } from "../user/user.model";
import { AuthTokens } from "./auth.interface";
import { ChangePasswordInput, LoginInput, PlatformLoginInput, SignupInput } from "./auth.validation";

const TRIAL_SMS_BONUS = 50;

function issueTenantTokens(user: UserDoc): AuthTokens {
  return {
    accessToken: signAccessToken({
      sub: user.id,
      scope: "tenant",
      role: user.role,
      company: String(user.company),
    }),
    refreshToken: signRefreshToken({ sub: user.id, scope: "tenant", tv: user.tokenVersion }),
  };
}

function issuePlatformTokens(admin: PlatformUserDoc): AuthTokens {
  return {
    accessToken: signAccessToken({ sub: admin.id, scope: "platform", role: admin.role }),
    refreshToken: signRefreshToken({ sub: admin.id, scope: "platform", tv: admin.tokenVersion }),
  };
}

function profile(user: UserDoc, company: CompanyDoc) {
  return {
    user: user.toJSON(),
    company: company.toJSON(),
    permissions: resolvePermissions(user.role, user.permissions),
  };
}

/* ───────────────────────── Tenant ───────────────────────── */

async function signup(input: SignupInput) {
  if (await Company.exists({ slug: input.slug })) throw new AppError(409, "This subdomain is already taken");

  const trialPlan = await Plan.findOne({ isTrial: true, isActive: true });
  if (!trialPlan) throw new AppError(500, "Trial plan is not configured. Run the seed script.");

  const now = new Date();
  const trialEndsAt = addDays(now, config.trialDays);
  const session = await mongoose.startSession();

  try {
    let company!: CompanyDoc;
    let owner!: UserDoc;

    await session.withTransaction(async () => {
      [company] = await Company.create(
        [
          {
            name: input.companyName,
            slug: input.slug,
            email: input.email,
            phone: input.phone,
            status: "trial",
            trialEndsAt,
            smsBalance: TRIAL_SMS_BONUS,
            usage: { customers: 0, routers: 0, staff: 1 },
          },
        ],
        { session },
      );

      [owner] = await User.create(
        [
          {
            company: company._id,
            name: input.ownerName,
            phone: input.phone,
            email: input.email,
            password: input.password,
            role: "owner",
          },
        ],
        { session },
      );

      company.owner = owner._id;
      await company.save({ session });

      await Subscription.create(
        [
          {
            company: company._id,
            plan: trialPlan._id,
            status: "trialing",
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
          },
        ],
        { session },
      );
    });

    return { ...profile(owner, company), tokens: issueTenantTokens(owner) };
  } finally {
    await session.endSession();
  }
}

async function login({ identifier, password, companySlug }: LoginInput) {
  const phone = normalizeBdPhone(identifier);
  const filter = phone ? { phone } : { email: identifier.toLowerCase() };

  let candidates = await User.find(filter).select("+password");

  if (companySlug) {
    const company = await Company.findOne({ slug: companySlug }).select("_id");
    candidates = company ? candidates.filter((u) => String(u.company) === company.id) : [];
  }

  // Check the password against every candidate so we never reveal which accounts exist.
  const matches: UserDoc[] = [];
  for (const u of candidates) if (await u.comparePassword(password)) matches.push(u);

  if (matches.length === 0) throw new AppError(401, "Invalid credentials");
  if (matches.length > 1) {
    const companies = await Company.find({ _id: { $in: matches.map((m) => m.company) } }).select("name slug");
    throw new AppError(409, "This account belongs to multiple companies. Select one.", {
      companies: companies.map((c) => ({ name: c.name, slug: c.slug })),
    });
  }

  const user = matches[0];
  if (!user.isActive) throw new AppError(403, "Your account has been deactivated");

  const company = await Company.findById(user.company);
  if (!company || company.status === "archived" || company.deletedAt) {
    throw new AppError(403, "Company account is not available");
  }

  user.lastLogin = new Date();
  await user.save();

  return { ...profile(user, company), tokens: issueTenantTokens(user) };
}

async function refresh(token: string | undefined) {
  if (!token) throw new AppError(401, "Session expired. Please log in again.");
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new AppError(401, "Session expired. Please log in again.");
  }
  if (payload.scope !== "tenant") throw new AppError(401, "Invalid session");

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
    throw new AppError(401, "Session expired. Please log in again.");
  }
  return issueTenantTokens(user);
}

async function me(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, "User not found");
  const [company, subscription] = await Promise.all([
    Company.findById(user.company),
    Subscription.findOne({ company: user.company }).populate("plan", "name slug limits features"),
  ]);
  if (!company) throw new AppError(404, "Company not found");
  return { ...profile(user, company), subscription };
}

async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await User.findById(userId).select("+password");
  if (!user) throw new AppError(404, "User not found");
  if (!(await user.comparePassword(input.currentPassword))) {
    throw new AppError(400, "Current password is incorrect");
  }
  user.password = input.newPassword;
  user.tokenVersion += 1; // log out every other session
  await user.save();
  return issueTenantTokens(user);
}

/** Invalidate every refresh token of this user. */
async function logoutAll(userId: string) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}

/* ───────────────────────── Platform ───────────────────────── */

async function platformLogin({ email, password }: PlatformLoginInput) {
  const admin = await PlatformUser.findOne({ email }).select("+password");
  if (!admin || !(await admin.comparePassword(password))) throw new AppError(401, "Invalid credentials");
  if (!admin.isActive) throw new AppError(403, "Your account has been deactivated");
  admin.lastLogin = new Date();
  await admin.save();
  return { admin: admin.toJSON(), tokens: issuePlatformTokens(admin) };
}

async function platformRefresh(token: string | undefined) {
  if (!token) throw new AppError(401, "Session expired. Please log in again.");
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new AppError(401, "Session expired. Please log in again.");
  }
  if (payload.scope !== "platform") throw new AppError(401, "Invalid session");
  const admin = await PlatformUser.findById(payload.sub);
  if (!admin || !admin.isActive || admin.tokenVersion !== payload.tv) {
    throw new AppError(401, "Session expired. Please log in again.");
  }
  return issuePlatformTokens(admin);
}

async function platformMe(id: string) {
  const admin = await PlatformUser.findById(id);
  if (!admin) throw new AppError(404, "Admin not found");
  return admin;
}

export const AuthService = {
  signup,
  login,
  refresh,
  me,
  changePassword,
  logoutAll,
  platformLogin,
  platformRefresh,
  platformMe,
};
