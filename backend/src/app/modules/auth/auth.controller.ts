import { CookieOptions, Request, Response } from "express";
import config from "../../config";
import AppError from "../../errors/AppError";
import { durationToMs } from "../../utils/duration";
import sendResponse from "../../utils/sendResponse";
import { PLATFORM_REFRESH_COOKIE, TENANT_REFRESH_COOKIE } from "./auth.interface";
import { AuthService } from "./auth.service";

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: "lax",
  domain: config.cookieDomain,
  path: "/",
  maxAge: durationToMs(config.jwt.refreshExpires),
};

/**
 * Next to each httpOnly refresh cookie we set "<name>_on=1", readable by the browser.
 * It holds no secret — it only tells public pages (website header) that a session exists,
 * so they skip the refresh call for visitors who are not logged in.
 */
const hintName = (name: string) => `${name}_on`;

const setRefresh = (res: Response, name: string, token: string, maxAge = cookieOptions.maxAge) => {
  res.cookie(name, token, { ...cookieOptions, maxAge });
  res.cookie(hintName(name), "1", { ...cookieOptions, httpOnly: false, maxAge });
};

/** Used by the super-admin impersonation endpoint (short-lived tenant session). */
export const setTenantRefreshCookie = (res: Response, token: string, maxAgeMs: number) =>
  setRefresh(res, TENANT_REFRESH_COOKIE, token, maxAgeMs);

const noImpersonation = (req: Request) => {
  if (req.user?.impersonatedBy) throw new AppError(403, "Not allowed while impersonating");
};
const clearRefresh = (res: Response, name: string) => {
  const { maxAge: _maxAge, ...opts } = cookieOptions;
  res.clearCookie(name, opts);
  res.clearCookie(hintName(name), { ...opts, httpOnly: false });
};

/* ───────────────────────── Tenant ───────────────────────── */

const signup = async (req: Request, res: Response) => {
  const { tokens, ...result } = await AuthService.signup(req.body);
  setRefresh(res, TENANT_REFRESH_COOKIE, tokens.refreshToken);
  sendResponse(res, {
    statusCode: 201,
    message: "Account created. Your free trial has started.",
    data: { ...result, accessToken: tokens.accessToken },
  });
};

const login = async (req: Request, res: Response) => {
  const { tokens, ...result } = await AuthService.login(req.body);
  setRefresh(res, TENANT_REFRESH_COOKIE, tokens.refreshToken);
  sendResponse(res, { message: "Logged in", data: { ...result, accessToken: tokens.accessToken } });
};

const refreshToken = async (req: Request, res: Response) => {
  try {
    const tokens = await AuthService.refresh(req.cookies?.[TENANT_REFRESH_COOKIE]);
    setRefresh(res, TENANT_REFRESH_COOKIE, tokens.refreshToken);
    sendResponse(res, { message: "Token refreshed", data: { accessToken: tokens.accessToken } });
  } catch (err) {
    clearRefresh(res, TENANT_REFRESH_COOKIE);
    throw err;
  }
};

const logout = async (_req: Request, res: Response) => {
  clearRefresh(res, TENANT_REFRESH_COOKIE);
  sendResponse(res, { message: "Logged out" });
};

const logoutAll = async (req: Request, res: Response) => {
  noImpersonation(req);
  await AuthService.logoutAll(req.user!.id);
  clearRefresh(res, TENANT_REFRESH_COOKIE);
  sendResponse(res, { message: "Logged out from all devices" });
};

const me = async (req: Request, res: Response) => {
  const data = await AuthService.me(req.user!.id);
  const imp = req.user!.impersonatedBy;
  const admin = imp ? await AuthService.platformMe(imp).catch(() => null) : null;
  sendResponse(res, { message: "Profile", data: { ...data, impersonation: imp ? { by: admin?.name ?? "Platform admin" } : null } });
};

const changePassword = async (req: Request, res: Response) => {
  noImpersonation(req);
  const tokens = await AuthService.changePassword(req.user!.id, req.body);
  setRefresh(res, TENANT_REFRESH_COOKIE, tokens.refreshToken);
  sendResponse(res, { message: "Password changed", data: { accessToken: tokens.accessToken } });
};

/* ───────────────────────── Platform ───────────────────────── */

const platformLogin = async (req: Request, res: Response) => {
  const { tokens, admin } = await AuthService.platformLogin(req.body);
  setRefresh(res, PLATFORM_REFRESH_COOKIE, tokens.refreshToken);
  sendResponse(res, { message: "Logged in", data: { admin, accessToken: tokens.accessToken } });
};

const platformRefreshToken = async (req: Request, res: Response) => {
  try {
    const tokens = await AuthService.platformRefresh(req.cookies?.[PLATFORM_REFRESH_COOKIE]);
    setRefresh(res, PLATFORM_REFRESH_COOKIE, tokens.refreshToken);
    sendResponse(res, { message: "Token refreshed", data: { accessToken: tokens.accessToken } });
  } catch (err) {
    clearRefresh(res, PLATFORM_REFRESH_COOKIE);
    throw err;
  }
};

const platformLogout = async (_req: Request, res: Response) => {
  clearRefresh(res, PLATFORM_REFRESH_COOKIE);
  sendResponse(res, { message: "Logged out" });
};

const twoFactorSetup = async (req: Request, res: Response) => {
  sendResponse(res, { message: "Scan the QR code, then enter a code to confirm", data: await AuthService.twoFactorSetup(req.platformUser!.id) });
};

const twoFactorEnable = async (req: Request, res: Response) => {
  await AuthService.twoFactorEnable(req.platformUser!.id, req.body.code);
  sendResponse(res, { message: "Two-factor authentication is on" });
};

const twoFactorDisable = async (req: Request, res: Response) => {
  await AuthService.twoFactorDisable(req.platformUser!.id, req.body.password, req.body.code);
  sendResponse(res, { message: "Two-factor authentication is off" });
};

const platformChangePassword = async (req: Request, res: Response) => {
  const tokens = await AuthService.platformChangePassword(req.platformUser!.id, req.body.currentPassword, req.body.newPassword);
  setRefresh(res, PLATFORM_REFRESH_COOKIE, tokens.refreshToken);
  sendResponse(res, { message: "Password changed", data: { accessToken: tokens.accessToken } });
};

const platformMe = async (req: Request, res: Response) => {
  const admin = await AuthService.platformMe(req.platformUser!.id);
  sendResponse(res, { message: "Profile", data: admin });
};

export const AuthController = {
  signup,
  login,
  refreshToken,
  logout,
  logoutAll,
  me,
  changePassword,
  platformLogin,
  platformRefreshToken,
  platformLogout,
  platformMe,
  twoFactorSetup,
  twoFactorEnable,
  twoFactorDisable,
  platformChangePassword,
};
