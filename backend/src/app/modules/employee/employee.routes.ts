import { Request, Response, Router } from "express";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import sendResponse from "../../utils/sendResponse";
import { audit } from "../activityLog/activityLog.service";
import { periodOf } from "../invoice/invoice.service";
import { User } from "../user/user.model";
import { decisionSchema, EmployeeService, employeeSchema, employeeUpdateSchema, handoverSchema, salarySchema } from "./employee.service";

const id = (req: Request) => String(req.params.id);

/* ── /employees: HR and salary ── */
export const employeeRoutes = Router();
employeeRoutes.use(auth(), requireWritableTenant);

employeeRoutes.get("/", authorize("employee.view"), async (req: Request, res: Response) => {
  const { data, meta } = await EmployeeService.listEmployees(req.query as Record<string, unknown>);
  sendResponse(res, { message: "Employees", data, meta });
});

employeeRoutes.post("/", authorize("employee.manage"), validateBody(employeeSchema), audit("employee.create", "employee"), async (req: Request, res: Response) => {
  sendResponse(res, { statusCode: 201, message: "Employee added", data: await EmployeeService.createEmployee(req.body) });
});

employeeRoutes.get("/salary-sheet", authorize("employee.salary"), async (req: Request, res: Response) => {
  const m = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : periodOf();
  sendResponse(res, { message: "Salary sheet", data: await EmployeeService.salarySheet(m) });
});

employeeRoutes.get("/salaries", authorize("employee.salary"), async (req: Request, res: Response) => {
  const { data, meta } = await EmployeeService.salaryHistory(req.query as Record<string, unknown>);
  sendResponse(res, { message: "Salary payments", data, meta });
});

employeeRoutes.post("/salaries", authorize("employee.salary"), validateBody(salarySchema), audit("employee.salary_pay", "salary"), async (req: Request, res: Response) => {
  sendResponse(res, { statusCode: 201, message: "Salary paid and added to expenses", data: await EmployeeService.paySalary(req.user!.company, req.user!.id, req.body) });
});

employeeRoutes.delete("/salaries/:id", authorize("employee.salary"), audit("employee.salary_delete", "salary"), async (req: Request, res: Response) => {
  await EmployeeService.deleteSalary(id(req));
  sendResponse(res, { message: "Salary payment deleted" });
});

employeeRoutes.get("/:id", authorize("employee.view"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Employee", data: await EmployeeService.getEmployee(id(req)) });
});

employeeRoutes.patch("/:id", authorize("employee.manage"), validateBody(employeeUpdateSchema), audit("employee.update", "employee"), async (req: Request, res: Response) => {
  sendResponse(res, { message: "Employee updated", data: await EmployeeService.updateEmployee(id(req), req.body) });
});

/* ── /collections: cash in hand and handover ── */
export const collectionRoutes = Router();
collectionRoutes.use(auth(), requireWritableTenant);

collectionRoutes.get("/summary", authorize("collection.view"), async (_req: Request, res: Response) => {
  sendResponse(res, { message: "Cash in hand", data: await EmployeeService.cashSummary() });
});

collectionRoutes.get("/me", async (req: Request, res: Response) => {
  sendResponse(res, { message: "My cash", data: await EmployeeService.myCash(req.user!.id) });
});

/** People you can hand cash to: owner, admin, manager, accountant. */
collectionRoutes.get("/receivers", async (req: Request, res: Response) => {
  const users = await User.find({ isActive: true, _id: { $ne: req.user!.id }, role: { $in: ["owner", "admin", "manager", "accountant"] } }).select("name role").sort("name");
  sendResponse(res, { message: "Receivers", data: users });
});

collectionRoutes.get("/handovers", async (req: Request, res: Response) => {
  const canSeeAll = req.user!.permissions.includes("collection.view");
  const { data, meta } = await EmployeeService.listHandovers({ id: req.user!.id, canSeeAll }, req.query as Record<string, unknown>);
  sendResponse(res, { message: "Handovers", data, meta });
});

collectionRoutes.post("/handovers", authorize("collection.handover"), validateBody(handoverSchema), audit("collection.handover", "handover"), async (req: Request, res: Response) => {
  sendResponse(res, { statusCode: 201, message: "Handover sent — waiting for the receiver to confirm", data: await EmployeeService.createHandover(req.user!.id, req.body) });
});

collectionRoutes.post("/handovers/:id/decide", validateBody(decisionSchema), audit("collection.handover_decide", "handover"), async (req: Request, res: Response) => {
  const h = await EmployeeService.decideHandover({ id: req.user!.id, role: req.user!.role }, id(req), req.body);
  sendResponse(res, { message: `Handover ${h.status}`, data: h });
});
