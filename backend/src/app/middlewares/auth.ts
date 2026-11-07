import { NextFunction, Request, Response } from "express";
import { Permission, resolvePermissions } from "../constants/permissions";
import { PlatformRole } from "../constants/roles";
import AppError from "../errors/AppError";
import { Company, isCompanyWritable } from "../modules/company/company.model";
import { PlatformUser } from "../modules/platformUser/platformUser.model";
import { User } from "../modules/user/user.model";
import { AccessPayload, verifyAccessToken } from "../utils/jwt";
import { tenantStorage } from "../utils/tenantContext";

function readToken(req: Request): AccessPayload {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) throw new AppError(401, "Authentication required");
  try {
    return verifyAccessToken(token);
  } catch {
    throw new AppError(401, "Invalid or expired token");
  }
}

/**
 * Tenant (ISP staff) authentication.
 * Sets req.user / req.company and runs the rest of the request inside the
 * tenant context so every Mongoose query is scoped to this company.
 */
export const auth = () => async (req: Request, _res: Response, next: NextFunction) => {
  const payload = readToken(req);
  if (payload.scope !== "tenant" || !payload.company) throw new AppError(403, "Tenant access only");

  const [user, company] = await Promise.all([
    User.findOne({ _id: payload.sub, company: payload.company }),
    Company.findById(payload.company),
  ]);
  if (!user || !user.isActive) throw new AppError(401, "Account is inactive or no longer exists");
  if (!company || company.status === "archived" || company.deletedAt) {
    throw new AppError(403, "Company account is not available");
  }

  req.user = {
    id: user.id,
    role: user.role,
    company: company.id,
    permissions: resolvePermissions(user.role, user.permissions),
    zones: user.zones.map(String),
    impersonatedBy: payload.imp,
  };
  req.company = company;

  tenantStorage.run({ companyId: company.id }, () => next());
};

/** Require every listed permission. */
export const authorize =
  (...perms: Permission[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError(401, "Authentication required");
    const missing = perms.filter((p) => !req.user!.permissions.includes(p));
    if (missing.length) throw new AppError(403, "You do not have permission for this action", { missing });
    next();
  };

/** Block writes while the subscription has lapsed (reads still work). */
export const requireWritableTenant = (req: Request, _res: Response, next: NextFunction) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  if (req.company && !isCompanyWritable(req.company)) {
    throw new AppError(402, "Your subscription is inactive. Please renew to continue.");
  }
  next();
};

/** Platform (super admin) authentication. */
export const platformAuth =
  (...roles: PlatformRole[]) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    const payload = readToken(req);
    if (payload.scope !== "platform") throw new AppError(403, "Platform access only");
    const admin = await PlatformUser.findById(payload.sub);
    if (!admin || !admin.isActive) throw new AppError(401, "Account is inactive or no longer exists");
    if (roles.length && !roles.includes(admin.role)) throw new AppError(403, "Insufficient role");
    req.platformUser = { id: admin.id, role: admin.role };
    next();
  };
