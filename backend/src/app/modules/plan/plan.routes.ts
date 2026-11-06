import { Request, Response, Router } from "express";
import sendResponse from "../../utils/sendResponse";
import { Plan } from "./plan.model";

const router = Router();

/** Public pricing page data. */
router.get("/", async (_req: Request, res: Response) => {
  const plans = await Plan.find({ isPublic: true, isActive: true, isTrial: false })
    .select("-stripePriceIds -__v")
    .sort("sortOrder");
  sendResponse(res, { message: "Plans", data: plans });
});

export default router;
