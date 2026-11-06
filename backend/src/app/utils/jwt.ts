import jwt, { SignOptions } from "jsonwebtoken";
import config from "../config";

export type TokenScope = "tenant" | "platform";

export type AccessPayload = {
  sub: string;
  scope: TokenScope;
  role: string;
  company?: string;
};

export type RefreshPayload = {
  sub: string;
  scope: TokenScope;
  /** token version — bump it on the user to invalidate every session */
  tv: number;
};

export const signAccessToken = (payload: AccessPayload) =>
  jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpires as SignOptions["expiresIn"],
  });

export const signRefreshToken = (payload: RefreshPayload) =>
  jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpires as SignOptions["expiresIn"],
  });

export const verifyAccessToken = (token: string) => jwt.verify(token, config.jwt.accessSecret) as AccessPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, config.jwt.refreshSecret) as RefreshPayload;
