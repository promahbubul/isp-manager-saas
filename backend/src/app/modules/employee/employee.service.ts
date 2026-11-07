import mongoose, { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { paginate } from "../../utils/paginate";
import { money, objectId, optionalText } from "../../utils/zod";
import { recordEntry } from "../accounts/accounts.service";
import { LedgerEntry } from "../accounts/ledger.model";
import { bdPhone } from "../auth/auth.validation";
import { periodOf } from "../invoice/invoice.service";
import { Payment } from "../payment/payment.model";
import { User } from "../user/user.model";
import { CashHandover, Employee, IEmployee, SALARY_TYPES, SalaryPayment } from "./employee.model";

const oid = (id: string) => new Types.ObjectId(id);
const round2 = (n: number) => Math.round(n * 100) / 100;
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must look like 2026-11");
const method = z.enum(["cash", "bank", "bkash", "nagad", "rocket", "other"]);

/* ───────────── employees ───────────── */

const employeeFields = {
  name: z.string().trim().min(2).max(100),
  phone: bdPhone,
  designation: optionalText(60),
  nid: optionalText(30),
  address: optionalText(300),
  joinDate: z.coerce.date(),
  monthlySalary: money,
  user: objectId.nullable(),
  isActive: z.boolean(),
  note: optionalText(500),
};
export const employeeSchema = z.object({ ...employeeFields, joinDate: employeeFields.joinDate.optional(), user: employeeFields.user.optional(), isActive: employeeFields.isActive.default(true) });
export const employeeUpdateSchema = z.object(employeeFields).partial();

async function assertUser(user?: string | null) {
  if (user && !(await User.exists({ _id: user }))) throw new AppError(400, "Login user not found");
}

function listEmployees(query: Record<string, unknown>) {
  const filter: Record<string, unknown> = {};
  if (query.active !== "all") filter.isActive = query.active === "false" ? false : true;
  return paginate<IEmployee>(Employee, filter, query, { searchFields: ["name", "phone", "designation"], defaultSort: "name", populate: [{ path: "user", select: "name role" }] });
}

async function createEmployee(input: z.infer<typeof employeeSchema>) {
  await assertUser(input.user);
  return Employee.create({ ...input, user: input.user ?? undefined, joinDate: input.joinDate ?? new Date() });
}

async function getEmployee(id: string) {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid employee id");
  const e = await Employee.findById(id).populate("user", "name role phone");
  if (!e) throw new AppError(404, "Employee not found");
  return e;
}

async function updateEmployee(id: string, input: z.infer<typeof employeeUpdateSchema>) {
  const e = await getEmployee(id);
  await assertUser(input.user);
  e.set({ ...input, user: input.user === null ? undefined : (input.user ?? e.user) });
  return e.save();
}

/* ───────────── salary ───────────── */

export const salarySchema = z.object({
  employee: objectId,
  month: month.optional(),
  type: z.enum(SALARY_TYPES).default("salary"),
  amount: z.coerce.number().positive().max(10_000_000),
  deduction: money.default(0),
  method: method.default("cash"),
  paidAt: z.coerce.date().optional(),
  note: optionalText(300),
});

/** Salary payment + matching expense entry, in one transaction. */
async function paySalary(companyId: string, userId: string, input: z.infer<typeof salarySchema>) {
  const emp = await getEmployee(input.employee);
  const paidAt = input.paidAt ?? new Date();
  const session = await mongoose.startSession();
  try {
    let id!: Types.ObjectId;
    await session.withTransaction(async () => {
      const [pay] = await SalaryPayment.create([{ ...input, company: companyId, month: input.month ?? periodOf(paidAt), paidAt, paidBy: userId }], { session });
      const entry = await recordEntry(
        { company: companyId, type: "expense", category: "Salary", amount: input.amount, date: paidAt, method: input.method === "cash" ? "cash" : input.method, note: `${emp.name} — ${input.type} ${pay.month}${input.note ? ` (${input.note})` : ""}`, source: "salary", ref: pay._id, createdBy: oid(userId) },
        session,
      );
      pay.ledgerEntry = entry._id;
      await pay.save({ session });
      id = pay._id;
    });
    return SalaryPayment.findById(id).populate("employee", "name designation");
  } finally {
    await session.endSession();
  }
}

async function deleteSalary(id: string) {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const p = await SalaryPayment.findById(id);
  if (!p) throw new AppError(404, "Salary payment not found");
  await LedgerEntry.deleteOne({ _id: p.ledgerEntry, source: "salary" });
  await p.deleteOne();
}

/** Who has been paid how much for a month (advances count towards it). */
async function salarySheet(m: string) {
  const [employees, paid] = await Promise.all([
    Employee.find({ isActive: true }).sort("name").select("name designation phone monthlySalary"),
    SalaryPayment.aggregate<{ _id: Types.ObjectId; salary: number; advance: number; bonus: number; deduction: number }>([
      { $match: { month: m } },
      {
        $group: {
          _id: "$employee",
          salary: { $sum: { $cond: [{ $eq: ["$type", "salary"] }, "$amount", 0] } },
          advance: { $sum: { $cond: [{ $eq: ["$type", "advance"] }, "$amount", 0] } },
          bonus: { $sum: { $cond: [{ $eq: ["$type", "bonus"] }, "$amount", 0] } },
          deduction: { $sum: "$deduction" },
        },
      },
    ]),
  ]);
  const byEmp = new Map(paid.map((p) => [String(p._id), p]));
  const rows = employees.map((e) => {
    const p = byEmp.get(e.id) ?? { salary: 0, advance: 0, bonus: 0, deduction: 0 };
    const remaining = round2(Math.max(0, e.monthlySalary - p.salary - p.advance - p.deduction));
    return { employee: e, monthlySalary: e.monthlySalary, ...p, _id: undefined, remaining, status: remaining <= 0 ? "paid" : p.salary + p.advance > 0 ? "partial" : "unpaid" };
  });
  const sum = (k: "monthlySalary" | "salary" | "advance" | "bonus" | "remaining") => round2(rows.reduce((n, r) => n + r[k], 0));
  return { month: m, rows, totals: { monthlySalary: sum("monthlySalary"), paid: round2(sum("salary") + sum("advance") + sum("bonus")), remaining: sum("remaining") } };
}

function salaryHistory(query: Record<string, unknown>) {
  const filter: Record<string, unknown> = {};
  if (typeof query.employee === "string" && isValidObjectId(query.employee)) filter.employee = query.employee;
  return paginate(SalaryPayment, filter, query, { filterFields: ["month", "type"], defaultSort: "-paidAt", populate: [{ path: "employee", select: "name designation" }, { path: "paidBy", select: "name" }] });
}

/* ───────────── cash in hand & handover ───────────── */

/**
 * Cash in hand of a staff user = cash recharges they took
 *   + cash handed to them (accepted) − cash they handed on (pending or accepted).
 * Pending counts as gone so the same money cannot be handed twice.
 */
async function cashPosition(userIds?: Types.ObjectId[]) {
  const match = userIds ? { $in: userIds } : { $exists: true };
  const [collected, given, received] = await Promise.all([
    Payment.aggregate<{ _id: Types.ObjectId; amount: number }>([
      { $match: { receivedBy: match, method: "cash", status: "success", reseller: null } },
      { $group: { _id: "$receivedBy", amount: { $sum: "$amount" } } },
    ]),
    CashHandover.aggregate<{ _id: Types.ObjectId; amount: number; pending: number }>([
      { $match: { from: match, status: { $in: ["pending", "accepted"] } } },
      { $group: { _id: "$from", amount: { $sum: "$amount" }, pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] } } } },
    ]),
    CashHandover.aggregate<{ _id: Types.ObjectId; amount: number }>([{ $match: { to: match, status: "accepted" } }, { $group: { _id: "$to", amount: { $sum: "$amount" } } }]),
  ]);
  const ids = new Set([...collected, ...given, ...received].map((x) => String(x._id)));
  const get = <T extends { _id: Types.ObjectId }>(arr: T[], id: string) => arr.find((x) => String(x._id) === id);
  return [...ids].map((id) => {
    const c = get(collected, id)?.amount ?? 0;
    const g = get(given, id);
    const r = get(received, id)?.amount ?? 0;
    return { user: id, collected: round2(c), received: round2(r), handedOver: round2(g?.amount ?? 0), pendingOut: round2(g?.pending ?? 0), inHand: round2(c + r - (g?.amount ?? 0)) };
  });
}

async function cashSummary() {
  const rows = await cashPosition();
  const users = await User.find({ _id: { $in: rows.map((r) => r.user) } }).select("name role");
  const names = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({ ...r, user: names.get(r.user) ?? { _id: r.user, name: "Unknown" } })).sort((a, b) => b.inHand - a.inHand);
}

async function myCash(userId: string) {
  const [row] = await cashPosition([oid(userId)]);
  return row ?? { user: userId, collected: 0, received: 0, handedOver: 0, pendingOut: 0, inHand: 0 };
}

export const handoverSchema = z.object({ to: objectId, amount: z.coerce.number().positive(), note: optionalText(300) });
export const decisionSchema = z.object({ accept: z.boolean(), note: optionalText(300) });

async function createHandover(userId: string, input: z.infer<typeof handoverSchema>) {
  if (input.to === userId) throw new AppError(400, "You cannot hand cash to yourself");
  const to = await User.findOne({ _id: input.to, isActive: true }).select("role");
  if (!to) throw new AppError(400, "Receiver not found");
  const mine = await myCash(userId);
  if (input.amount > mine.inHand) throw new AppError(400, `You only have ৳${mine.inHand} in hand`);
  return CashHandover.create({ from: userId, to: input.to, amount: input.amount, note: input.note });
}

function listHandovers(actor: { id: string; canSeeAll: boolean }, query: Record<string, unknown>) {
  const filter: Record<string, unknown> = actor.canSeeAll ? {} : { $or: [{ from: actor.id }, { to: actor.id }] };
  return paginate(CashHandover, filter, query, {
    filterFields: ["status"],
    populate: [
      { path: "from", select: "name role" },
      { path: "to", select: "name role" },
    ],
  });
}

/** Only the receiver (or owner/admin) can confirm the cash arrived. */
async function decideHandover(actor: { id: string; role: string }, id: string, input: z.infer<typeof decisionSchema>) {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const h = await CashHandover.findById(id);
  if (!h) throw new AppError(404, "Handover not found");
  if (h.status !== "pending") throw new AppError(400, `Already ${h.status}`);
  if (String(h.to) !== actor.id && actor.role !== "owner" && actor.role !== "admin") throw new AppError(403, "Only the receiver can confirm this");
  h.status = input.accept ? "accepted" : "rejected";
  h.decidedAt = new Date();
  h.decisionNote = input.note;
  return h.save();
}

export const EmployeeService = {
  listEmployees,
  createEmployee,
  getEmployee,
  updateEmployee,
  paySalary,
  deleteSalary,
  salarySheet,
  salaryHistory,
  cashSummary,
  myCash,
  createHandover,
  listHandovers,
  decideHandover,
};
