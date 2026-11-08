import { Request, Response, Router } from "express";
import AppError from "../../errors/AppError";
import { auth, authorize } from "../../middlewares/auth";
import { buildXlsx, sendXlsx, XlsxColumn } from "../../services/excel/excel.service";
import sendResponse from "../../utils/sendResponse";
import { Actor } from "../customer/customer.service";
import { REPORT_PERMISSION, REPORT_TYPES, ReportService, ReportType } from "./report.service";

const router = Router();
router.use(auth());

router.get("/:type", authorize("report.view"), async (req: Request, res: Response) => {
  const type = String(req.params.type) as ReportType;
  if (!REPORT_TYPES.includes(type)) throw new AppError(404, "Unknown report");
  const need = REPORT_PERMISSION[type];
  if (need && !req.user!.permissions.includes(need)) throw new AppError(403, "You do not have permission for this report");
  const actor: Actor = { id: req.user!.id, role: req.user!.role, company: req.user!.company, zones: req.user!.zones, reseller: req.user!.reseller };
  const report = await ReportService.buildReport(actor, type, req.query as Record<string, unknown>);

  if (req.query.format === "xlsx") {
    if (!req.user!.permissions.includes("report.export")) throw new AppError(403, "You cannot export reports");
    const columns: XlsxColumn[] = report.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.type === "money" || c.type === "number" ? 14 : 22,
      numFmt: c.type === "money" ? "#,##0.00" : c.type === "date" ? "dd/mm/yyyy" : c.type === "datetime" ? "dd/mm/yyyy hh:mm" : undefined,
    }));
    const buffer = await buildXlsx(report.title, columns, report.rows);
    return sendXlsx(res, `${type}-${new Date().toISOString().slice(0, 10)}.xlsx`, buffer);
  }
  sendResponse(res, { message: report.title, data: report });
});

export default router;
