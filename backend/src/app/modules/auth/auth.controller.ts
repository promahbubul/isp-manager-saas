import { CookieOptions, Request, Response } from "express";
import config from "../../config";
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

const setRefresh = (res: Response, name: string, token: string) => res.cookie(name, token, cookieOptions);
const clearRefresh = (res: Response, name: string) => {
  const { maxAge: _maxAge, ...opts } = cookieOptions;
  res.clearCookie(name, opts);
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
  await AuthService.logoutAll(req.user!.id);
  clearRefresh(res, TENANT_REFRESH_COOKIE);
  sendResponse(res, { message: "Logged out from all devices" });
};

const me = async (req: Request, res: Response) => {
  const data = await AuthService.me(req.user!.id);
  sendResponse(res, { message: "Profile", data });
};

const changePassword = async (req: Request, res: Response) => {
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
};
