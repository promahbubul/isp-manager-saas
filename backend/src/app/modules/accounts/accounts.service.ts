import { ClientSession, isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { parseDay, startOfDhakaMonth } from "../../utils/date";
import { addDays } from "../../utils/duration";
import { paginate } from "../../utils/paginate";
import { optionalText } from "../../utils/zod";
import { Payment } from "../payment/payment.model";
import { DEFAULT_CATEGORIES, ILedgerEntry, LEDGER_METHODS, LEDGER_TYPES, LedgerEntry } from "./ledger.model";

const fields = {
  type: z.enum(LEDGER_TYPES),
  category: z.string().trim().min(2).max(50),
  amount: z.coerce.number().positive().max(100_000_000),
  date: z.coerce.date(),
  method: z.enum(LEDGER_METHODS),
  note: optionalText(500),
};
export const entrySchema = z.object({ ...fields, method: fields.method.default("cash"), date: fields.date.optional() });
export const entryUpdateSchema = z.object(fields).partial();

const oid = (id: string) => new Types.ObjectId(id);

/** Inclusive Dhaka-day range; defaults to the current month. */
export function dateRange(query: Record<string, unknown>) {
  const from = parseDay(query.from) ?? startOfDhakaMonth();
  const toDay = parseDay(query.to);
  const to = toDay ? addDays(toDay, 1) : new Date();
  if (from >= to) throw new AppError(400, "From date must be before To date");
  return { from, to };
}

async function list(query: Record<string, unknown>) {
  const { from, to } = dateRange(query);
  const filter: Record<string, unknown> = { date: { $gte: from, $lt: to } };
  const result = await paginate<ILedgerEntry>(LedgerEntry, filter, query, {
    searchFields: ["category", "note"],
    filterFields: ["type", "category", "method", "source"],
    defaultSort: "-date",
    populate: [{ path: "createdBy", select: "name" }],
  });
  const match: Record<string, unknown> = { date: { $gte: from, $lt: to } };
  for (const k of ["type", "category", "method", "source"]) if (typeof query[k] === "string" && query[k]) match[k] = query[k];
  const totals = await LedgerEntry.aggregate<{ _id: string; amount: number }>([{ $match: match }, { $group: { _id: "$type", amount: { $sum: "$amount" } } }]);
  const t = Object.fromEntries(totals.map((x) => [x._id, x.amount]));
  return { ...result, totals: { income: t.income ?? 0, expense: t.expense ?? 0 } };
}

async function create(userId: string, input: z.infer<typeof entrySchema>) {
  return LedgerEntry.create({ ...input, date: input.date ?? new Date(), source: "manual", createdBy: userId });
}

async function findManual(id: string) {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid entry id");
  const e = await LedgerEntry.findById(id);
  if (!e) throw new AppError(404, "Entry not found");
  if (e.source !== "manual") throw new AppError(400, `This entry was created by ${e.source.replace("_", " ")} — change it there`);
  return e;
}

async function update(id: string, input: z.infer<typeof entryUpdateSchema>) {
  const e = await findManual(id);
  e.set(input);
  return e.save();
}

async function remove(id: string) {
  const e = await findManual(id);
  await e.deleteOne();
}

async function categories() {
  const used = await LedgerEntry.aggregate<{ _id: { type: string; category: string } }>([{ $group: { _id: { type: "$type", category: "$category" } } }]);
  const out = { expense: new Set(DEFAULT_CATEGORIES.expense), income: new Set(DEFAULT_CATEGORIES.income) };
  for (const u of used) out[u._id.type as "income" | "expense"]?.add(u._id.category);
  return { expense: [...out.expense], income: [...out.income] };
}

/** Automatic entries from other modules (salary, purchases, reseller deposits). */
export function recordEntry(entry: Omit<ILedgerEntry, "company"> & { company: string | Types.ObjectId }, session?: ClientSession) {
  return LedgerEntry.create([entry], { session }).then(([e]) => e);
}

/**
 * Profit & loss for a period.
 * Income = customer bills collected (Payment) + other income entries.
 * Customer payments taken by a reseller are the reseller's money: the ISP's income for
 * those is the reseller's deposit (an income entry), so they are excluded here.
 */
async function profitAndLoss(companyId: string, query: Record<string, unknown>) {
  const { from, to } = dateRange(query);
  const company = oid(companyId);
  const [collections, ledger, monthly] = await Promise.all([
    Payment.aggregate<{ _id: string; amount: number; count: number }>([
      { $match: { company, status: "success", reseller: null, createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: "$type", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    LedgerEntry.aggregate<{ _id: { type: string; category: string }; amount: number }>([
      { $match: { company, date: { $gte: from, $lt: to } } },
      { $group: { _id: { type: "$type", category: "$category" }, amount: { $sum: "$amount" } } },
      { $sort: { amount: -1 } },
    ]),
    monthlyTrend(company),
  ]);

  const billLabels: Record<string, string> = { recharge: "Customer bills", connection_fee: "Connection fees", other: "Other customer payments" };
  const incomeRows = [
    ...collections.map((c) => ({ category: billLabels[c._id] ?? c._id, amount: c.amount, count: c.count, auto: true })),
    ...ledger.filter((l) => l._id.type === "income").map((l) => ({ category: l._id.category, amount: l.amount })),
  ];
  const expenseRows = ledger.filter((l) => l._id.type === "expense").map((l) => ({ category: l._id.category, amount: l.amount }));
  const income = round2(incomeRows.reduce((n, r) => n + r.amount, 0));
  const expense = round2(expenseRows.reduce((n, r) => n + r.amount, 0));
  return {
    from,
    to: addDays(to, -1),
    income: { total: income, rows: incomeRows },
    expense: { total: expense, rows: expenseRows },
    net: round2(income - expense),
    margin: income ? Math.round(((income - expense) / income) * 1000) / 10 : null,
    monthly,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Last 12 months (Dhaka calendar months): income vs expense. */
async function monthlyTrend(company: Types.ObjectId) {
  const start = startOfDhakaMonth(addDays(startOfDhakaMonth(), -330));
  const month = (field: string) => ({ $dateToString: { format: "%Y-%m", date: `$${field}`, timezone: "Asia/Dhaka" } });
  const [pay, led] = await Promise.all([
    Payment.aggregate<{ _id: string; amount: number }>([
      { $match: { company, status: "success", reseller: null, createdAt: { $gte: start } } },
      { $group: { _id: month("createdAt"), amount: { $sum: "$amount" } } },
    ]),
    LedgerEntry.aggregate<{ _id: { m: string; type: string }; amount: number }>([
      { $match: { company, date: { $gte: start } } },
      { $group: { _id: { m: month("date"), type: "$type" }, amount: { $sum: "$amount" } } },
    ]),
  ]);
  const map = new Map<string, { month: string; income: number; expense: number }>();
  const row = (m: string) => map.get(m) ?? map.set(m, { month: m, income: 0, expense: 0 }).get(m)!;
  for (const p of pay) row(p._id).income += p.amount;
  for (const l of led) row(l._id.m)[l._id.type as "income" | "expense"] += l.amount;
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month)).map((r) => ({ ...r, income: round2(r.income), expense: round2(r.expense), net: round2(r.income - r.expense) }));
}

/**
 * Cash book: only physical cash. In = cash bills collected + cash income entries;
 * out = cash expenses. Opening balance = everything before `from`.
 */
async function cashBook(companyId: string, query: Record<string, unknown>) {
  const { from, to } = dateRange(query);
  const company = oid(companyId);
  const day = (f: string) => ({ $dateToString: { format: "%Y-%m-%d", date: `$${f}`, timezone: "Asia/Dhaka" } });
  const sumBefore = async () => {
    const [p, l] = await Promise.all([
      Payment.aggregate<{ t: number }>([{ $match: { company, status: "success", method: "cash", reseller: null, createdAt: { $lt: from } } }, { $group: { _id: null, t: { $sum: "$amount" } } }]),
      LedgerEntry.aggregate<{ _id: string; t: number }>([{ $match: { company, method: "cash", date: { $lt: from } } }, { $group: { _id: "$type", t: { $sum: "$amount" } } }]),
    ]);
    const led = Object.fromEntries(l.map((x) => [x._id, x.t]));
    return (p[0]?.t ?? 0) + (led.income ?? 0) - (led.expense ?? 0);
  };
  const [opening, bills, entries] = await Promise.all([
    sumBefore(),
    Payment.aggregate<{ _id: string; amount: number; count: number }>([
      { $match: { company, status: "success", method: "cash", reseller: null, createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: day("createdAt"), amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    LedgerEntry.find({ method: "cash", date: { $gte: from, $lt: to } }).sort("date").select("type category amount date note"),
  ]);
  const days = new Map<string, { date: string; in: number; out: number; lines: { kind: "in" | "out"; text: string; amount: number }[] }>();
  const get = (d: string) => days.get(d) ?? days.set(d, { date: d, in: 0, out: 0, lines: [] }).get(d)!;
  for (const b of bills) {
    const r = get(b._id);
    r.in += b.amount;
    r.lines.push({ kind: "in", text: `Customer bills (${b.count})`, amount: b.amount });
  }
  for (const e of entries) {
    const d = new Date(e.date.getTime() + 6 * 3600_000).toISOString().slice(0, 10);
    const r = get(d);
    const kind = e.type === "income" ? "in" : "out";
    r[kind] += e.amount;
    r.lines.push({ kind, text: `${e.category}${e.note ? ` — ${e.note}` : ""}`, amount: e.amount });
  }
  let balance = round2(opening);
  const rows = [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      balance = round2(balance + r.in - r.out);
      return { ...r, in: round2(r.in), out: round2(r.out), balance };
    });
  return { from, to: addDays(to, -1), opening: round2(opening), closing: balance, totalIn: round2(rows.reduce((n, r) => n + r.in, 0)), totalOut: round2(rows.reduce((n, r) => n + r.out, 0)), rows };
}

export const AccountsService = { list, create, update, remove, categories, profitAndLoss, cashBook };
