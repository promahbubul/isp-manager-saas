import mongoose from "mongoose";
import { Permission } from "../../constants/permissions";
import AppError from "../../errors/AppError";
import { parseDay, startOfDhakaDay, startOfDhakaMonth } from "../../utils/date";
import { addDays } from "../../utils/duration";
import { Customer } from "../customer/customer.model";
import { Actor, customerScope } from "../customer/customer.service";
import { LedgerEntry } from "../accounts/ledger.model";
import { CustomerInvoice } from "../invoice/invoice.model";
import { Payment } from "../payment/payment.model";

export type ColumnType = "text" | "money" | "date" | "datetime" | "number";
export type ReportColumn = { key: string; header: string; type?: ColumnType };
export type Report = {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary: { label: string; value: number; type?: ColumnType }[];
};

export const REPORT_TYPES = [
  "collection",
  "due",
  "expiring",
  "expired",
  "new-customers",
  "left-customers",
  "package-wise",
  "payments",
  "expenses",
  "invoices",
] as const;
/** Detailed lists that need the module's own view permission besides report.view. */
export const REPORT_PERMISSION: Partial<Record<(typeof REPORT_TYPES)[number], Permission>> = {
  payments: "payment.view",
  expenses: "expense.view",
  invoices: "invoice.view",
};
export type ReportType = (typeof REPORT_TYPES)[number];

const MAX_ROWS = 10_000;
const oid = (id: string) => new mongoose.Types.ObjectId(id);

function range(q: Record<string, unknown>) {
  const from = parseDay(q.from) ?? startOfDhakaMonth();
  const toDay = parseDay(q.to) ?? startOfDhakaDay();
  return { from, to: addDays(toDay, 1) };
}

/** customerScope() with ObjectIds, for aggregate(). */
function aggScope(actor: Actor) {
  const s = customerScope(actor);
  const zone = s.zone as { $in: string[] } | undefined;
  return zone ? { ...s, zone: { $in: zone.$in.map(oid) } } : s;
}

const customerColumns: ReportColumn[] = [
  { key: "customerId", header: "ID" },
  { key: "name", header: "Name" },
  { key: "phone", header: "Mobile" },
  { key: "username", header: "Username" },
  { key: "zone", header: "Zone" },
  { key: "package", header: "Package" },
  { key: "monthlyBill", header: "Monthly bill", type: "money" },
  { key: "dueAmount", header: "Due", type: "money" },
  { key: "expiryDate", header: "Expiry", type: "date" },
  { key: "status", header: "Status" },
];

async function customerRows(filter: Record<string, unknown>, sort: string) {
  const list = await Customer.find(filter)
    .sort(sort)
    .limit(MAX_ROWS)
    .populate({ path: "zone", select: "name" })
    .populate({ path: "package", select: "name" })
    .lean();
  return list.map((c) => ({
    customerId: c.customerId,
    name: c.name,
    phone: c.phone,
    username: c.pppoe?.username,
    zone: (c.zone as unknown as { name?: string } | undefined)?.name ?? "",
    package: (c.package as unknown as { name?: string } | undefined)?.name ?? "",
    monthlyBill: Math.max(0, c.monthlyFee - c.discount),
    dueAmount: c.dueAmount,
    expiryDate: c.expiryDate,
    status: c.status,
    createdAt: (c as { createdAt?: Date }).createdAt,
    deletedAt: c.deletedAt,
  }));
}

async function collection(actor: Actor, q: Record<string, unknown>): Promise<Report> {
  const { from, to } = range(q);
  const groupBy = ["day", "collector", "method", "zone"].includes(String(q.groupBy)) ? String(q.groupBy) : "day";
  const match: Record<string, unknown> = { status: "success", createdAt: { $gte: from, $lt: to } };
  if (actor.role === "collector") match.receivedBy = oid(actor.id);

  const pipeline: mongoose.PipelineStage[] = [{ $match: match }];
  let key: unknown;
  if (groupBy === "day") key = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Dhaka" } };
  else if (groupBy === "method") key = "$method";
  else if (groupBy === "collector") key = "$receivedBy";
  else {
    pipeline.push(
      { $lookup: { from: "customers", localField: "customer", foreignField: "_id", as: "c" } },
      { $set: { zone: { $first: "$c.zone" } } },
    );
    key = "$zone";
  }
  pipeline.push({ $group: { _id: key, amount: { $sum: "$amount" }, count: { $sum: 1 } } }, { $sort: { _id: 1 } });

  const groups = await Payment.aggregate<{ _id: unknown; amount: number; count: number }>(pipeline);

  // Resolve ids to names for collector/zone grouping.
  const names = new Map<string, string>();
  if (groupBy === "collector" || groupBy === "zone") {
    const coll = groupBy === "collector" ? "users" : "zones";
    const ids = groups.map((g) => g._id).filter(Boolean);
    const docs = await mongoose.connection.db!.collection(coll).find({ _id: { $in: ids as mongoose.Types.ObjectId[] } }).project({ name: 1 }).toArray();
    for (const d of docs) names.set(String(d._id), String(d.name));
  }

  const label = { day: "Date", collector: "Collector", method: "Method", zone: "Zone" }[groupBy]!;
  const rows = groups.map((g) => ({
    group: g._id === null || g._id === undefined ? "(none)" : (names.get(String(g._id)) ?? String(g._id)),
    count: g.count,
    amount: g.amount,
  }));
  return {
    title: `Collection by ${label.toLowerCase()}`,
    columns: [
      { key: "group", header: label },
      { key: "count", header: "Payments", type: "number" },
      { key: "amount", header: "Amount", type: "money" },
    ],
    rows,
    summary: [
      { label: "Total collected", value: rows.reduce((n, r) => n + r.amount, 0), type: "money" },
      { label: "Payments", value: rows.reduce((n, r) => n + r.count, 0), type: "number" },
    ],
  };
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
type Named = { name?: string; customerId?: string } | undefined;

async function payments(actor: Actor, q: Record<string, unknown>): Promise<Report> {
  const { from, to } = range(q);
  const filter: Record<string, unknown> = { createdAt: { $gte: from, $lt: to } };
  if (actor.role === "collector") filter.receivedBy = actor.id;
  for (const k of ["method", "type", "status"]) if (str(q[k])) filter[k] = str(q[k]);
  const list = await Payment.find(filter)
    .sort("-createdAt")
    .limit(MAX_ROWS)
    .populate({ path: "customer", select: "name customerId" })
    .populate({ path: "receivedBy", select: "name" })
    .lean();
  const rows = list.map((p) => ({
    receiptNo: p.receiptNo,
    createdAt: (p as { createdAt?: Date }).createdAt,
    customerId: (p.customer as unknown as Named)?.customerId ?? "",
    customer: (p.customer as unknown as Named)?.name ?? "",
    type: p.type.replace("_", " "),
    months: p.months,
    method: p.method,
    trxId: p.trxId ?? "",
    amount: p.amount,
    receivedBy: (p.receivedBy as unknown as Named)?.name ?? (p.source === "staff" ? "" : "Online"),
    status: p.status,
  }));
  const ok = rows.filter((r) => r.status === "success");
  return {
    title: "Payments",
    columns: [
      { key: "receiptNo", header: "Receipt" },
      { key: "createdAt", header: "Time", type: "datetime" },
      { key: "customerId", header: "Customer ID" },
      { key: "customer", header: "Customer" },
      { key: "type", header: "Type" },
      { key: "months", header: "Months", type: "number" },
      { key: "method", header: "Method" },
      { key: "trxId", header: "Trx ID" },
      { key: "amount", header: "Amount", type: "money" },
      { key: "receivedBy", header: "Received by" },
      { key: "status", header: "Status" },
    ],
    rows,
    summary: [
      { label: "Collected", value: ok.reduce((n, r) => n + r.amount, 0), type: "money" },
      { label: "Payments", value: ok.length, type: "number" },
    ],
  };
}

async function expenses(q: Record<string, unknown>): Promise<Report> {
  const { from, to } = range(q);
  const filter: Record<string, unknown> = { date: { $gte: from, $lt: to } };
  if (q.type === "income" || q.type === "expense") filter.type = q.type;
  const list = await LedgerEntry.find(filter).sort("-date").limit(MAX_ROWS).populate({ path: "createdBy", select: "name" }).lean();
  const rows = list.map((e) => ({
    date: e.date,
    type: e.type,
    category: e.category,
    amount: e.amount,
    method: e.method,
    note: e.note ?? "",
    source: e.source === "manual" ? ((e.createdBy as unknown as Named)?.name ?? "manual") : e.source.replace("_", " "),
  }));
  const sum = (t: string) => rows.filter((r) => r.type === t).reduce((n, r) => n + r.amount, 0);
  return {
    title: "Income & expenses",
    columns: [
      { key: "date", header: "Date", type: "date" },
      { key: "type", header: "Type" },
      { key: "category", header: "Category" },
      { key: "amount", header: "Amount", type: "money" },
      { key: "method", header: "Paid by" },
      { key: "note", header: "Note" },
      { key: "source", header: "From" },
    ],
    rows,
    summary: [
      { label: "Other income", value: sum("income"), type: "money" },
      { label: "Expenses", value: sum("expense"), type: "money" },
    ],
  };
}

async function invoices(q: Record<string, unknown>): Promise<Report> {
  const filter: Record<string, unknown> = {};
  if (str(q.status)) filter.status = q.status;
  if (typeof q.period === "string" && /^\d{4}-\d{2}$/.test(q.period)) filter.period = q.period;
  const list = await CustomerInvoice.find(filter).sort("-issuedAt").limit(MAX_ROWS).populate({ path: "customer", select: "name customerId" }).lean();
  const rows = list.map((i) => ({
    invoiceNo: i.invoiceNo,
    period: i.period,
    customerId: (i.customer as unknown as Named)?.customerId ?? "",
    customer: (i.customer as unknown as Named)?.name ?? "",
    amount: i.amount,
    paid: i.paid,
    left: i.status === "void" ? 0 : Math.max(0, i.amount - i.paid),
    dueDate: i.dueDate,
    status: i.status,
  }));
  return {
    title: "Invoices",
    columns: [
      { key: "invoiceNo", header: "Invoice" },
      { key: "period", header: "Month" },
      { key: "customerId", header: "Customer ID" },
      { key: "customer", header: "Customer" },
      { key: "amount", header: "Amount", type: "money" },
      { key: "paid", header: "Paid", type: "money" },
      { key: "left", header: "Unpaid", type: "money" },
      { key: "dueDate", header: "Due date", type: "date" },
      { key: "status", header: "Status" },
    ],
    rows,
    summary: [
      { label: "Invoices", value: rows.length, type: "number" },
      { label: "Unpaid", value: rows.reduce((n, r) => n + r.left, 0), type: "money" },
    ],
  };
}

async function buildReport(actor: Actor, type: ReportType, q: Record<string, unknown>): Promise<Report> {
  const scope = customerScope(actor);
  switch (type) {
    case "collection":
      return collection(actor, q);
    case "payments":
      return payments(actor, q);
    case "expenses":
      return expenses(q);
    case "invoices":
      return invoices(q);

    case "due": {
      const rows = await customerRows({ ...scope, dueAmount: { $gt: 0 } }, "-dueAmount");
      return {
        title: "Due list",
        columns: customerColumns,
        rows,
        summary: [
          { label: "Customers with due", value: rows.length, type: "number" },
          { label: "Total due", value: rows.reduce((n, r) => n + r.dueAmount, 0), type: "money" },
        ],
      };
    }

    case "expiring": {
      const days = Math.min(60, Math.max(1, Number(q.days) || 3));
      const now = new Date();
      const rows = await customerRows({ ...scope, status: "active", expiryDate: { $gte: now, $lte: addDays(now, days) } }, "expiryDate");
      return {
        title: `Expiring in ${days} day(s)`,
        columns: customerColumns,
        rows,
        summary: [
          { label: "Customers", value: rows.length, type: "number" },
          { label: "Expected collection", value: rows.reduce((n, r) => n + r.monthlyBill + r.dueAmount, 0), type: "money" },
        ],
      };
    }

    case "expired": {
      const rows = await customerRows({ ...scope, status: "expired" }, "expiryDate");
      return {
        title: "Expired customers",
        columns: customerColumns,
        rows,
        summary: [
          { label: "Customers", value: rows.length, type: "number" },
          { label: "Pending revenue", value: rows.reduce((n, r) => n + r.monthlyBill + r.dueAmount, 0), type: "money" },
        ],
      };
    }

    case "new-customers": {
      const { from, to } = range(q);
      const rows = await customerRows({ ...scope, createdAt: { $gte: from, $lt: to } }, "-createdAt");
      return {
        title: "New customers",
        columns: [...customerColumns, { key: "createdAt", header: "Added", type: "datetime" }],
        rows,
        summary: [{ label: "New customers", value: rows.length, type: "number" }],
      };
    }

    case "left-customers": {
      const { from, to } = range(q);
      const filter = { ...scope, deletedAt: { $gte: from, $lt: to } };
      const rows = await customerRows(filter, "-deletedAt");
      return {
        title: "Customers who left",
        columns: [...customerColumns, { key: "deletedAt", header: "Left on", type: "date" }],
        rows,
        summary: [{ label: "Left", value: rows.length, type: "number" }],
      };
    }

    case "package-wise": {
      const groups = await Customer.aggregate<{ _id: unknown; name: string; active: number; expired: number; other: number; revenue: number }>([
        { $match: aggScope(actor) },
        {
          $group: {
            _id: "$package",
            active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
            expired: { $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] } },
            other: { $sum: { $cond: [{ $in: ["$status", ["disabled", "free"]] }, 1, 0] } },
            revenue: {
              $sum: { $cond: [{ $eq: ["$status", "active"] }, { $max: [0, { $subtract: ["$monthlyFee", "$discount"] }] }, 0] },
            },
          },
        },
        { $lookup: { from: "packages", localField: "_id", foreignField: "_id", as: "p" } },
        { $set: { name: { $ifNull: [{ $first: "$p.name" }, "(deleted)"] } } },
        { $sort: { active: -1 } },
      ]);
      const rows = groups.map((g) => ({ package: g.name, active: g.active, expired: g.expired, other: g.other, total: g.active + g.expired + g.other, revenue: g.revenue }));
      return {
        title: "Package-wise customers",
        columns: [
          { key: "package", header: "Package" },
          { key: "active", header: "Active", type: "number" },
          { key: "expired", header: "Expired", type: "number" },
          { key: "other", header: "Disabled/Free", type: "number" },
          { key: "total", header: "Total", type: "number" },
          { key: "revenue", header: "Monthly revenue (active)", type: "money" },
        ],
        rows,
        summary: [
          { label: "Customers", value: rows.reduce((n, r) => n + r.total, 0), type: "number" },
          { label: "Monthly revenue", value: rows.reduce((n, r) => n + r.revenue, 0), type: "money" },
        ],
      };
    }
    default:
      throw new AppError(404, "Unknown report");
  }
}

export const ReportService = { buildReport };
