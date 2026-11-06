import mongoose from "mongoose";
import AppError from "../../errors/AppError";
import { parseDay, startOfDhakaDay, startOfDhakaMonth } from "../../utils/date";
import { addDays } from "../../utils/duration";
import { Customer } from "../customer/customer.model";
import { Actor, customerScope } from "../customer/customer.service";
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
] as const;
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

async function buildReport(actor: Actor, type: ReportType, q: Record<string, unknown>): Promise<Report> {
  const scope = customerScope(actor);
  switch (type) {
    case "collection":
      return collection(actor, q);

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
