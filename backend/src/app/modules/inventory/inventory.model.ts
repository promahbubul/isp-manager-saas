import { model, Schema, Types } from "mongoose";
import { tenantPlugin } from "../../plugins/tenant.plugin";

export const ITEM_CATEGORIES = ["router", "onu", "switch", "fiber_cable", "utp_cable", "connector", "splitter", "tools", "other"] as const;
export const ITEM_UNITS = ["pcs", "meter", "box", "roll", "kg"] as const;

export interface IInventoryItem {
  company: Types.ObjectId;
  name: string;
  sku?: string;
  category: (typeof ITEM_CATEGORIES)[number];
  unit: (typeof ITEM_UNITS)[number];
  stock: number;
  /** weighted average purchase cost per unit */
  avgCost: number;
  /** warn when stock falls to this level */
  minStock: number;
  /** devices are tracked by serial/MAC */
  trackSerials: boolean;
  serials: string[];
  isActive: boolean;
  note?: string;
}

const itemSchema = new Schema<IInventoryItem>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    sku: { type: String, trim: true, maxlength: 50 },
    category: { type: String, enum: ITEM_CATEGORIES, default: "other" },
    unit: { type: String, enum: ITEM_UNITS, default: "pcs" },
    stock: { type: Number, default: 0, min: 0 },
    avgCost: { type: Number, default: 0, min: 0 },
    minStock: { type: Number, default: 0, min: 0 },
    trackSerials: { type: Boolean, default: false },
    serials: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    note: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);
itemSchema.plugin(tenantPlugin);
itemSchema.index({ company: 1, name: 1 }, { unique: true });

export const InventoryItem = model<IInventoryItem>("InventoryItem", itemSchema);

/**
 * in      — purchase (adds stock, may record an expense)
 * out     — issued (to a customer installation or to a staff member)
 * return  — back from a customer/staff
 * damage  — written off
 * adjust  — stock count correction (+/−)
 */
export const MOVEMENT_TYPES = ["in", "out", "return", "damage", "adjust"] as const;

export interface IStockMovement {
  company: Types.ObjectId;
  item: Types.ObjectId;
  type: (typeof MOVEMENT_TYPES)[number];
  /** signed: + into stock, − out of stock */
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  serials: string[];
  customer?: Types.ObjectId;
  employee?: Types.ObjectId;
  supplier?: string;
  note?: string;
  date: Date;
  stockAfter: number;
  by?: Types.ObjectId;
  ledgerEntry?: Types.ObjectId;
}

const movementSchema = new Schema<IStockMovement>(
  {
    item: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    quantity: { type: Number, required: true },
    unitCost: Number,
    totalCost: Number,
    serials: { type: [String], default: [] },
    customer: { type: Schema.Types.ObjectId, ref: "Customer" },
    employee: { type: Schema.Types.ObjectId, ref: "Employee" },
    supplier: { type: String, maxlength: 100 },
    note: { type: String, maxlength: 300 },
    date: { type: Date, required: true },
    stockAfter: { type: Number, required: true },
    by: { type: Schema.Types.ObjectId, ref: "User" },
    ledgerEntry: { type: Schema.Types.ObjectId, ref: "LedgerEntry" },
  },
  { timestamps: true },
);
movementSchema.plugin(tenantPlugin);
movementSchema.index({ company: 1, item: 1, date: -1 });
movementSchema.index({ company: 1, customer: 1 });

export const StockMovement = model<IStockMovement>("StockMovement", movementSchema);
