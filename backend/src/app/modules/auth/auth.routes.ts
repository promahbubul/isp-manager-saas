import { Request, Response, Router } from "express";
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

export default router;
