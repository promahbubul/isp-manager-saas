import mongoose, { ClientSession, isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { paginate } from "../../utils/paginate";
import { money, objectId, optionalText } from "../../utils/zod";
import { recordEntry } from "../accounts/accounts.service";
import { password } from "../auth/auth.validation";
import { bdPhone } from "../auth/auth.validation";
import { Customer } from "../customer/customer.model";
import { Plan } from "../plan/plan.model";
import { Subscription } from "../subscription/subscription.model";
import { User } from "../user/user.model";
import { IResellerTx, Reseller, ResellerTx } from "./reseller.model";

const rates = z.array(z.object({ package: objectId, price: money }));
export const createResellerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: bdPhone,
  address: optionalText(300),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  rates: rates.default([]),
  creditLimit: money.default(0),
  note: optionalText(500),
  /** login password for the reseller panel */
  password,
});
export const updateResellerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    address: optionalText(300),
    discountPercent: z.coerce.number().min(0).max(100),
    rates,
    creditLimit: money,
    note: optionalText(500),
    isActive: z.boolean(),
    password,
  })
  .partial();
export const depositSchema = z.object({
  amount: z.coerce.number().positive().max(10_000_000),
  method: z.enum(["cash", "bank", "bkash", "nagad", "rocket", "other"]).default("cash"),
  note: optionalText(300),
});
export const adjustSchema = z.object({
  /** + or − correction; does not count as income */
  amount: z.coerce.number().refine((n) => n !== 0, "Must not be zero"),
  note: z.string().trim().min(3).max(300),
});

async function assertResellerLimit(companyId: string) {
  const sub = await Subscription.findOne({ company: companyId }).select("plan");
  const plan = sub ? await Plan.findById(sub.plan).select("name limits") : null;
  const limit = plan?.limits?.resellers ?? 0;
  if (limit === -1) return;
  const used = await Reseller.countDocuments({ isActive: true });
  if (used >= limit) throw new AppError(403, `Your ${plan?.name ?? "current"} plan allows up to ${limit} resellers. Upgrade your plan to add more.`, { resource: "resellers", limit, used });
}

async function list(query: Record<string, unknown>) {
  const page = await paginate(Reseller, {}, query, { searchFields: ["name", "phone"], filterFields: [], defaultSort: "name" });
  const ids = page.data.map((r) => (r as unknown as { _id: Types.ObjectId })._id);
  const counts = await Customer.aggregate<{ _id: Types.ObjectId; total: number; active: number }>([
    { $match: { reseller: { $in: ids }, deletedAt: null } },
    { $group: { _id: "$reseller", total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c]));
  return { ...page, data: page.data.map((r) => ({ ...r, customers: byId.get(String((r as unknown as { _id: Types.ObjectId })._id)) ?? { total: 0, active: 0 } })) };
}

async function create(companyId: string, input: z.infer<typeof createResellerSchema>) {
  await assertResellerLimit(companyId);
  if (await Reseller.exists({ phone: input.phone })) throw new AppError(409, "A reseller with this mobile number exists");
  if (await User.exists({ phone: input.phone })) throw new AppError(409, "This mobile number is already used by a staff login");
  const { password: pw, ...data } = input;
  const session = await mongoose.startSession();
  try {
    let id!: Types.ObjectId;
    await session.withTransaction(async () => {
      const [reseller] = await Reseller.create([{ ...data, company: companyId }], { session });
      const [user] = await User.create([{ company: companyId, name: input.name, phone: input.phone, password: pw, role: "reseller", reseller: reseller._id }], { session });
      reseller.user = user._id;
      await reseller.save({ session });
      id = reseller._id;
    });
    return Reseller.findById(id).orFail();
  } finally {
    await session.endSession();
  }
}

async function get(id: string) {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid reseller id");
  const r = await Reseller.findById(id).populate("rates.package", "name price").populate("user", "name phone lastLogin isActive");
  if (!r) throw new AppError(404, "Reseller not found");
  return r;
}

async function update(companyId: string, id: string, input: z.infer<typeof updateResellerSchema>) {
  const r = await get(id);
  const { password: pw, ...data } = input;
  if (data.isActive === true && !r.isActive) await assertResellerLimit(companyId);
  r.set(data);
  await r.save();
  if (r.user && (pw || data.isActive !== undefined || data.name)) {
    const user = await User.findById(r.user);
    if (user) {
      if (pw) user.password = pw;
      if (data.name) user.name = data.name;
      if (data.isActive !== undefined) user.isActive = data.isActive;
      if (pw || data.isActive === false) user.tokenVersion += 1;
      await user.save();
    }
  }
  return get(id);
}

/**
 * Atomic balance change + ledger row. `minBalance` guards deductions
 * (−creditLimit for recharges); deposits pass undefined.
 */
export async function changeResellerBalance(
  resellerId: Types.ObjectId | string,
  tx: Omit<IResellerTx, "company" | "reseller" | "balanceAfter">,
  session?: ClientSession,
  minBalance?: number,
) {
  const filter: Record<string, unknown> = { _id: resellerId, isActive: true };
  if (minBalance !== undefined) filter.balance = { $gte: minBalance - tx.amount }; // balance + amount ≥ minBalance
  const r = await Reseller.findOneAndUpdate(filter, { $inc: { balance: tx.amount } }, { returnDocument: "after", session });
  if (!r) {
    const exists = await Reseller.findById(resellerId).session(session ?? null).select("balance isActive creditLimit");
    if (!exists || !exists.isActive) throw new AppError(400, "Reseller is inactive");
    throw new AppError(402, `Insufficient reseller balance: needs ৳${-tx.amount}, available ৳${exists.balance + exists.creditLimit}. Ask the ISP to add balance.`, {
      needed: -tx.amount,
      balance: exists.balance,
      creditLimit: exists.creditLimit,
    });
  }
  const [row] = await ResellerTx.create([{ ...tx, company: r.company, reseller: r._id, balanceAfter: r.balance }], { session });
  return { reseller: r, tx: row };
}

/** ISP receives money from the reseller → reseller balance up, ISP income in the books. */
async function deposit(companyId: string, userId: string, id: string, input: z.infer<typeof depositSchema>) {
  await get(id);
  const session = await mongoose.startSession();
  try {
    let result!: Awaited<ReturnType<typeof changeResellerBalance>>;
    await session.withTransaction(async () => {
      result = await changeResellerBalance(id, { type: "deposit", amount: input.amount, method: input.method, note: input.note, by: new Types.ObjectId(userId) }, session);
      await recordEntry(
        { company: companyId, type: "income", category: "Reseller deposit", amount: input.amount, date: new Date(), method: input.method, note: `${result.reseller.name}${input.note ? ` — ${input.note}` : ""}`, source: "reseller_deposit", ref: result.tx._id, createdBy: new Types.ObjectId(userId) },
        session,
      );
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function adjust(userId: string, id: string, input: z.infer<typeof adjustSchema>) {
  await get(id);
  return changeResellerBalance(id, { type: "adjust", amount: input.amount, note: input.note, by: new Types.ObjectId(userId) });
}

function ledger(id: string, query: Record<string, unknown>) {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid reseller id");
  return paginate<IResellerTx>(ResellerTx, { reseller: id }, query, {
    filterFields: ["type"],
    populate: [
      { path: "customer", select: "name customerId" },
      { path: "by", select: "name" },
    ],
  });
}

/** For the reseller's own login. */
async function mine(resellerId: string | undefined) {
  if (!resellerId) throw new AppError(403, "Your login is not linked to a reseller account");
  const r = await get(resellerId);
  const [customers, recent] = await Promise.all([
    Customer.aggregate<{ _id: string; count: number }>([{ $match: { reseller: r._id, deletedAt: null } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    ResellerTx.find({ reseller: r._id }).sort("-createdAt").limit(20).populate("customer", "name customerId"),
  ]);
  return { reseller: r, customers: Object.fromEntries(customers.map((c) => [c._id, c.count])), recent };
}

export const ResellerService = { list, create, get, update, deposit, adjust, ledger, mine };
