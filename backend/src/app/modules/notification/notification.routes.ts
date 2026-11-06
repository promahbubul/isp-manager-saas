import { Request, Response, Router } from "express";
import { auth } from "../../middlewares/auth";
import sendResponse from "../../utils/sendResponse";
import { Notification } from "./notification.model";

const router = Router();
router.use(auth());

router.get("/", async (req: Request, res: Response) => {
  const user = req.user!.id;
  const [items, unread] = await Promise.all([
    Notification.find({ user }).sort("-createdAt").limit(30),
    Notification.countDocuments({ user, isRead: false }),
  ]);
  sendResponse(res, { message: "Notifications", data: { items, unread } });
});

router.patch("/read-all", async (req: Request, res: Response) => {
  await Notification.updateMany({ user: req.user!.id, isRead: false }, { isRead: true });
  sendResponse(res, { message: "All marked as read" });
});

router.patch("/:id/read", async (req: Request, res: Response) => {
  await Notification.updateOne({ _id: String(req.params.id), user: req.user!.id }, { isRead: true });
  sendResponse(res, { message: "Marked as read" });
});

export default router;
