import mongoose, { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { paginate } from "../../utils/paginate";
import { money, objectId, optionalText } from "../../utils/zod";
import { recordEntry } from "../accounts/accounts.service";
import { Customer } from "../customer/customer.model";
import { Employee } from "../employee/employee.model";
import { IInventoryItem, IStockMovement, ITEM_CATEGORIES, ITEM_UNITS, InventoryItem, MOVEMENT_TYPES, StockMovement } from "./inventory.model";

const round2 = (n: number) => Math.round(n * 100) / 100;

const itemFields = {
  name: z.string().trim().min(2).max(100),
  sku: optionalText(50),
  category: z.enum(ITEM_CATEGORIES),
  unit: z.enum(ITEM_UNITS),
  minStock: money,
  trackSerials: z.boolean(),
  isActive: z.boolean(),
  note: optionalText(300),
};
export const itemSchema = z.object({
  ...itemFields,
  category: itemFields.category.default("other"),
  unit: itemFields.unit.default("pcs"),
  minStock: itemFields.minStock.default(0),
  trackSerials: itemFields.trackSerials.default(false),
  isActive: itemFields.isActive.default(true),
});
export const itemUpdateSchema = z.object(itemFields).partial();

export const movementSchema = z
  .object({
    item: objectId,
    type: z.enum(MOVEMENT_TYPES),
    /** always positive except for "adjust" (+/−) */
    quantity: z.coerce.number().refine((n) => n !== 0, "Quantity must not be zero"),
    unitCost: money.optional(),
    serials: z.array(z.string().trim().min(1).max(60)).default([]),
    customer: objectId.optional(),
    employee: objectId.optional(),
    supplier: optionalText(100),
    note: optionalText(300),
    date: z.coerce.date().optional(),
    /** purchases: also add the cost to expenses (Accounts) */
    recordExpense: z.boolean().default(true),
  })
  .refine((d) => d.type === "adjust" || d.quantity > 0, { path: ["quantity"], message: "Quantity must be positive" });

function listItems(query: Record<string, unknown>) {
  const filter: Record<string, unknown> = {};
  if (query.low === "true") filter.$expr = { $lte: ["$stock", "$minStock"] };
  if (query.active !== "all") filter.isActive = true;
  return paginate<IInventoryItem>(InventoryItem, filter, query, { searchFields: ["name", "sku", "serials"], filterFields: ["category"], defaultSort: "name", select: "-serials" });
}

async function getItem(id: string) {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid item id");
  const item = await InventoryItem.findById(id);
  if (!item) throw new AppError(404, "Item not found");
  return item;
}

async function createItem(input: z.infer<typeof itemSchema>) {
  if (await InventoryItem.exists({ name: input.name })) throw new AppError(409, "An item with this name exists");
  return InventoryItem.create(input);
}

async function updateItem(id: string, input: z.infer<typeof itemUpdateSchema>) {
  const item = await getItem(id);
  item.set(input);
  return item.save();
}

/**
 * Stock in/out with one transaction: the item stock and serial list, the movement
 * row, and (for purchases) the expense entry change together.
 */
async function move(companyId: string, userId: string, input: z.infer<typeof movementSchema>) {
  const item = await getItem(input.item);
  if (input.customer && !(await Customer.exists({ _id: input.customer, deletedAt: null }))) throw new AppError(400, "Customer not found");
  if (input.employee && !(await Employee.exists({ _id: input.employee }))) throw new AppError(400, "Employee not found");

  const sign = input.type === "in" || input.type === "return" ? 1 : input.type === "adjust" ? Math.sign(input.quantity) : -1;
  const qty = Math.abs(input.quantity) * sign;
  const serials = [...new Set(input.serials)];
  if (item.trackSerials && input.type !== "adjust" && serials.length !== Math.abs(qty)) {
    throw new AppError(400, `Enter ${Math.abs(qty)} serial/MAC number(s) for ${item.name}`);
  }
  if (serials.length) {
    const inStock = new Set(item.serials);
    if (qty > 0) {
      const dup = serials.filter((s) => inStock.has(s));
      if (dup.length) throw new AppError(400, `Already in stock: ${dup.join(", ")}`);
    } else {
      const missing = serials.filter((s) => !inStock.has(s));
      if (missing.length) throw new AppError(400, `Not in stock: ${missing.join(", ")}`);
    }
  }
  if (input.type === "in" && input.unitCost === undefined) throw new AppError(400, "Enter the purchase price per unit");

  const session = await mongoose.startSession();
  try {
    let movementId!: Types.ObjectId;
    await session.withTransaction(async () => {
      const update: Record<string, unknown> = { $inc: { stock: qty } };
      if (serials.length) update[qty > 0 ? "$addToSet" : "$pullAll"] = qty > 0 ? { serials: { $each: serials } } : { serials };
      if (input.type === "in") {
        // weighted average cost
        const total = item.stock * item.avgCost + qty * (input.unitCost ?? 0);
        (update as { $set?: Record<string, unknown> }).$set = { avgCost: round2(total / Math.max(1, item.stock + qty)) };
      }
      const after = await InventoryItem.findOneAndUpdate({ _id: item._id, stock: { $gte: -qty } }, update, { returnDocument: "after", session });
      if (!after) throw new AppError(400, `Only ${item.stock} ${item.unit} of ${item.name} in stock`);

      const unitCost = input.type === "in" ? input.unitCost : item.avgCost;
      const [m] = await StockMovement.create(
        [
          {
            company: companyId,
            item: item._id,
            type: input.type,
            quantity: qty,
            unitCost,
            totalCost: round2(Math.abs(qty) * (unitCost ?? 0)),
            serials,
            customer: input.customer,
            employee: input.employee,
            supplier: input.supplier,
            note: input.note,
            date: input.date ?? new Date(),
            stockAfter: after.stock,
            by: userId,
          },
        ],
        { session },
      );
      if (input.type === "in" && input.recordExpense && m.totalCost) {
        const e = await recordEntry(
          { company: companyId, type: "expense", category: "Equipment", amount: m.totalCost, date: m.date, method: "cash", note: `${qty} ${item.unit} ${item.name}${input.supplier ? ` from ${input.supplier}` : ""}`, source: "inventory", ref: m._id, createdBy: new Types.ObjectId(userId) },
          session,
        );
        m.ledgerEntry = e._id;
        await m.save({ session });
      }
      movementId = m._id;
    });
    return StockMovement.findById(movementId).populate("item", "name unit stock").populate("customer", "name customerId");
  } finally {
    await session.endSession();
  }
}

function listMovements(query: Record<string, unknown>) {
  const filter: Record<string, unknown> = {};
  for (const k of ["item", "customer", "employee"]) if (typeof query[k] === "string" && isValidObjectId(query[k])) filter[k] = query[k];
  return paginate<IStockMovement>(StockMovement, filter, query, {
    searchFields: ["serials", "supplier", "note"],
    filterFields: ["type"],
    defaultSort: "-date",
    populate: [
      { path: "item", select: "name unit" },
      { path: "customer", select: "name customerId" },
      { path: "employee", select: "name" },
      { path: "by", select: "name" },
    ],
  });
}

async function summary() {
  const [value, low] = await Promise.all([
    InventoryItem.aggregate<{ value: number; items: number }>([{ $match: { isActive: true } }, { $group: { _id: null, value: { $sum: { $multiply: ["$stock", "$avgCost"] } }, items: { $sum: 1 } } }]),
    InventoryItem.find({ isActive: true, $expr: { $lte: ["$stock", "$minStock"] } }).select("name stock minStock unit").limit(20),
  ]);
  return { stockValue: round2(value[0]?.value ?? 0), items: value[0]?.items ?? 0, lowStock: low };
}

export const InventoryService = { listItems, getItem, createItem, updateItem, move, listMovements, summary };
