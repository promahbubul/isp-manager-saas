import { Request, Response, Router } from "express";
import { auth } from "../../middlewares/auth";
import sendResponse from "../../utils/sendResponse";
import { Subscription } from "../subscription/subscription.model";
import { Announcement } from "./announcement.model";

/** Tenant side: active announcements for this ISP's plan. */
const router = Router();

router.get("/", auth(), async (req: Request, res: Response) => {
  const sub = await Subscription.findOne({ company: req.user!.company }).select("plan");
  const now = new Date();
  const items = await Announcement.find({
    isActive: true,
    startAt: { $lte: now },
    $and: [
      { $or: [{ endAt: null }, { endAt: { $exists: false } }, { endAt: { $gt: now } }] },
      { $or: [{ plans: { $size: 0 } }, ...(sub ? [{ plans: sub.plan }] : [])] },
    ],
  })
    .select("title body type startAt")
    .sort("-startAt")
    .limit(5);
  sendResponse(res, { message: "Announcements", data: items });
});

export default router;
