import { Router } from "express";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { audit } from "../activityLog/activityLog.service";
import { UserController } from "./user.controller";
import { createUserSchema, updateUserSchema } from "./user.validation";

const router = Router();

router.use(auth(), requireWritableTenant);

router.get("/permissions", UserController.permissions);
router.get("/", authorize("staff.manage"), UserController.list);
router.post("/", authorize("staff.manage"), validateBody(createUserSchema), audit("staff.create", "user"), UserController.create);
router.get("/:id", authorize("staff.manage"), UserController.getById);
router.patch("/:id", authorize("staff.manage"), validateBody(updateUserSchema), audit("staff.update", "user"), UserController.update);
router.delete("/:id", authorize("staff.manage"), audit("staff.deactivate", "user"), UserController.deactivate);

export default router;
