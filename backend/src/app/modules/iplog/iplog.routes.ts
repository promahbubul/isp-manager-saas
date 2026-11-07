import { Request, Response, Router } from "express";
import { auth, authorize } from "../../middlewares/auth";
import { buildXlsx, sendXlsx } from "../../services/excel/excel.service";
import sendResponse from "../../utils/sendResponse";
import { audit } from "../activityLog/activityLog.service";
import { requireFeature } from "../subscription/planFeature";
import { exportRows, listSessions } from "./iplog.service";

/** /ip-logs — BTRC user/IP log (read-only; filled by the worker every 5 minutes). */
const router = Router();
router.use(auth(), requireFeature("ip_log"));

router.get("/", authorize("ip_log.view"), async (req: Request, res: Response) => {
  const { data, meta } = await listSessions(req.query as Record<string, unknown>);
  sendResponse(res, { message: "IP log", data, meta });
});

router.get("/export", authorize("ip_log.export"), audit("ip_log.export", "ip_log"), async (req: Request, res: Response) => {
  const rows = await exportRows(req.query as Record<string, unknown>);
  const buffer = await buildXlsx(
    "IP log",
    [
      { header: "PPPoE username", key: "username", width: 18 },
      { header: "Customer ID", key: "customerId", width: 12 },
      { header: "Name", key: "name", width: 22 },
      { header: "Mobile", key: "phone", width: 14 },
      { header: "NID", key: "nid", width: 18 },
      { header: "Address", key: "address", width: 30 },
      { header: "IP address", key: "ip", width: 16 },
      { header: "MAC", key: "mac", width: 19 },
      { header: "Router", key: "router", width: 14 },
      { header: "Login", key: "startedAt", width: 20, numFmt: "dd/mm/yyyy hh:mm:ss" },
      { header: "Logout", key: "endedAt", width: 20, numFmt: "dd/mm/yyyy hh:mm:ss" },
    ],
    rows,
  );
  sendXlsx(res, `ip-log-${new Date().toISOString().slice(0, 10)}.xlsx`, buffer);
});

export default router;
