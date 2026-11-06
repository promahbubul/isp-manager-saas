import { Request, Response, Router } from "express";
import { isValidObjectId } from "mongoose";
import { auth, authorize } from "../../middlewares/auth";
import { addDays } from "../../utils/duration";
import { paginate } from "../../utils/paginate";
import sendResponse from "../../utils/sendResponse";
import { parseDay } from "../../utils/date";
import { ActivityLog, IActivityLog } from "./activityLog.model";

const router = Router();

router.get("/", auth(), authorize("activity_log.view"), async (req: Request, res: Response) => {
  const q = req.query as Record<string, unknown>;
  const filter: Record<string, unknown> = {};
  if (typeof q.user === "string" && isValidObjectId(q.user)) filter.user = q.user;
  if (typeof q.entityId === "string") filter.entityId = q.entityId;
  const from = parseDay(q.from);
  const to = parseDay(q.to);
  if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: addDays(to, 1) } : {}) };

  const { data, meta } = await paginate<IActivityLog>(ActivityLog, filter, q, {
    searchFields: ["summary", "action"],
    filterFields: ["entity", "action"],
    populate: [{ path: "user", select: "name role" }],
  });
  sendResponse(res, { message: "Activity log", data, meta });
});

export default router;
