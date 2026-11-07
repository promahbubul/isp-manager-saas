import jwt, { SignOptions } from "jsonwebtoken";
import config from "../config";

/** customer = ISP's end customer in the self-care portal (sub = mobile number) */
export type TokenScope = "tenant" | "platform" | "customer";

export type AccessPayload = {
  sub: string;
  scope: TokenScope;
  role: string;
  company?: string;
  /** platform user id when a super admin is impersonating this tenant user */
  imp?: string;
};

export type RefreshPayload = {
  sub: string;
  scope: TokenScope;
  /** token version — bump it on the user to invalidate every session */
  tv: number;
  imp?: string;
};

export const signAccessToken = (payload: AccessPayload) =>
  jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpires as SignOptions["expiresIn"],
  });

export const signRefreshToken = (payload: RefreshPayload, expiresIn = config.jwt.refreshExpires) =>
  jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: expiresIn as SignOptions["expiresIn"],
  });

/** Portal session: no refresh token, the customer logs in again with a new OTP after 7 days. */
export const signPortalToken = (phone: string, company: string) =>
  jwt.sign({ sub: phone, scope: "customer", role: "customer", company } satisfies AccessPayload, config.jwt.accessSecret, { expiresIn: "7d" });

export const verifyAccessToken = (token: string) => jwt.verify(token, config.jwt.accessSecret) as AccessPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, config.jwt.refreshSecret) as RefreshPayload;
