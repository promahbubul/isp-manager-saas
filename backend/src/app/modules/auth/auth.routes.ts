import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Request, Response, Router } from "express";
import { z } from "zod";
import config from "../../config";
import AppError from "../../errors/AppError";
import { imageExtension, uploadImage } from "../../middlewares/upload";
import { User } from "../user/user.model";

const AVATAR_PREFIX = () => `${config.apiPublicUrl}/uploads/avatars/`;
/** File name of an avatar we stored ourselves (never touch an external URL). */
const oldAvatarFile = (url?: string | null) => (url?.startsWith(AVATAR_PREFIX()) ? path.basename(url.slice(AVATAR_PREFIX().length)) : null);
import sendResponse from "../../utils/sendResponse";
import { forgotSchema, requestPasswordReset, resetPassword, resetSchema } from "./passwordReset.service";
import { auth, platformAuth } from "../../middlewares/auth";
import { authLimiter } from "../../middlewares/rateLimiter";
import { validateBody } from "../../middlewares/validateRequest";
import { AuthController } from "./auth.controller";
import { changePasswordSchema, loginSchema, platformLoginSchema, signupSchema } from "./auth.validation";

const router = Router();

// Tenant (ISP staff)
router.post("/signup", authLimiter, validateBody(signupSchema), AuthController.signup);
router.post("/login", authLimiter, validateBody(loginSchema), AuthController.login);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/logout", AuthController.logout);
router.post("/logout-all", auth(), AuthController.logoutAll);
router.get("/me", auth(), AuthController.me);

/** Profile photo: PNG / JPG / WebP up to the upload limit. Replaces the previous one. */
router.post("/me/avatar", auth(), uploadImage, async (req: Request, res: Response) => {
  if (!req.file) throw new AppError(400, "Attach the image as 'file'");
  const ext = imageExtension(req.file.buffer);
  if (!ext) throw new AppError(400, "The file is not a valid PNG, JPG or WebP image");
  const user = await User.findById(req.user!.id);
  if (!user) throw new AppError(404, "User not found");
  const name = `${user.id}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(config.uploadDir, "avatars", name), req.file.buffer);
  const old = oldAvatarFile(user.avatar);
  user.avatar = AVATAR_PREFIX() + name;
  await user.save();
  if (old) await fs.unlink(path.join(config.uploadDir, "avatars", old)).catch(() => undefined);
  sendResponse(res, { message: "Profile photo updated", data: { avatar: user.avatar } });
});

router.delete("/me/avatar", auth(), async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw new AppError(404, "User not found");
  const old = oldAvatarFile(user.avatar);
  user.avatar = undefined;
  await user.save();
  if (old) await fs.unlink(path.join(config.uploadDir, "avatars", old)).catch(() => undefined);
  sendResponse(res, { message: "Profile photo removed", data: { avatar: null } });
});
router.post(
  "/change-password",
  authLimiter,
  auth(),
  validateBody(changePasswordSchema),
  AuthController.changePassword,
);
router.post("/forgot-password", authLimiter, validateBody(forgotSchema), async (req: Request, res: Response) => {
  const { message, sentTo } = await requestPasswordReset(req.body.identifier);
  sendResponse(res, { message, data: { sentTo } });
});
router.post("/reset-password", authLimiter, validateBody(resetSchema), async (req: Request, res: Response) => {
  const { message } = await resetPassword(req.body);
  sendResponse(res, { message });
});

// Platform (super admin)
router.post("/admin/login", authLimiter, validateBody(platformLoginSchema), AuthController.platformLogin);
router.post("/admin/refresh-token", AuthController.platformRefreshToken);
router.post("/admin/logout", AuthController.platformLogout);
router.get("/admin/me", platformAuth(), AuthController.platformMe);
router.post("/admin/2fa/setup", platformAuth(), AuthController.twoFactorSetup);
const sixDigits = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");
router.post("/admin/2fa/enable", platformAuth(), validateBody(z.object({ code: sixDigits })), AuthController.twoFactorEnable);
router.post(
  "/admin/2fa/disable",
  authLimiter,
  platformAuth(),
  validateBody(z.object({ password: z.string().min(1), code: sixDigits })),
  AuthController.twoFactorDisable,
);
router.post("/admin/change-password", authLimiter, platformAuth(), validateBody(changePasswordSchema), AuthController.platformChangePassword);

export default router;
