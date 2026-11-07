/**
 * Fills one ISP company with realistic sample data so the panel, reports and screenshots are not empty:
 * zones, packages, ~60 customers, 45 days of payments, support tickets and expenses.
 * Usage: pnpm seed:demo-data [companySlug]   (default: company1)
 * Safe to re-run: it does nothing if the company already has more than 10 customers.
 * Writes straight to the collections (no router sync, keeps historic dates); for development only.
 */
import { Types } from "mongoose";
import { connectDB, disconnectDB } from "../app/config/db";
import { LedgerEntry } from "../app/modules/accounts/ledger.model";
import { Company } from "../app/modules/company/company.model";
import { Counter } from "../app/modules/counter/counter.model";
import { Customer } from "../app/modules/customer/customer.model";
import { Package } from "../app/modules/package/package.model";
import { Payment } from "../app/modules/payment/payment.model";
import { MikrotikRouter as Router } from "../app/modules/router/router.model";
import { Ticket } from "../app/modules/ticket/ticket.model";
import { User } from "../app/modules/user/user.model";
import { Zone } from "../app/modules/zone/zone.model";
import { encrypt } from "../app/utils/encryption";

const DAY = 86_400_000;
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const pad = (n: number) => String(n).padStart(5, "0");

const FIRST = ["Rahim", "Karim", "Selina", "Hasan", "Nusrat", "Tanvir", "Farhana", "Imran", "Sadia", "Arif", "Mitu", "Rakib", "Shirin", "Jahid", "Ruma", "Sabbir", "Lima", "Masud", "Tania", "Fahim"];
const LAST = ["Uddin", "Hossain", "Akter", "Ahmed", "Islam", "Rahman", "Khatun", "Chowdhury", "Sarkar", "Mia"];
const ZONES = ["Mirpur 10", "Mirpur 11", "Pallabi", "Kazipara"];
const PACKAGES = [
  { name: "10 Mbps Home", speedDown: 10, speedUp: 10, price: 500, mikrotikProfile: "10M" },
  { name: "20 Mbps Home", speedDown: 20, speedUp: 20, price: 800, mikrotikProfile: "20M" },
  { name: "30 Mbps Plus", speedDown: 30, speedUp: 30, price: 1000, mikrotikProfile: "30M" },
  { name: "50 Mbps Office", speedDown: 50, speedUp: 50, price: 1500, mikrotikProfile: "50M" },
];
const TICKETS = [
  ["no_internet", "No internet since morning", "high"],
  ["slow_speed", "Speed drops in the evening", "medium"],
  ["fiber_cut", "Fiber cut near the main road", "high"],
  ["router_issue", "Wi-Fi router keeps restarting", "low"],
  ["billing", "Paid by bKash but line is off", "medium"],
  ["new_connection", "Wants a second connection for the shop", "low"],
] as const;
const EXPENSES = [
  ["Bandwidth", 45000],
  ["Office rent", 15000],
  ["Electricity", 4200],
  ["Fiber & equipment", 8600],
  ["Staff transport", 2500],
] as const;

async function main(slug: string) {
  const company = await Company.findOne({ slug }).lean();
  if (!company) throw new Error(`Company "${slug}" not found`);
  const cid = company._id;
  const existing = await Customer.collection.countDocuments({ company: cid });
  if (existing > 10) {
    console.log(`ℹ️  ${company.name} already has ${existing} customers — nothing to do`);
    return;
  }

  const router = await Router.collection.findOne({ company: cid });
  if (!router) throw new Error("Add a router to this company first");
  const staff = await User.collection.find({ company: cid }).toArray();
  const collectors = staff.filter((u) => ["owner", "collector", "manager"].includes(u.role)).map((u) => u._id);
  const technician = staff.find((u) => u.role === "technician")?._id ?? null;
  const now = Date.now();
  const stamp = (d: Date) => ({ createdAt: d, updatedAt: d });

  // Zones & packages (reuse the ones with the same name)
  const zoneIds: Types.ObjectId[] = [];
  for (const name of ZONES) {
    const z = await Zone.collection.findOneAndUpdate({ company: cid, name }, { $setOnInsert: { company: cid, name, ...stamp(new Date()) } }, { upsert: true, returnDocument: "after" });
    zoneIds.push(z!._id);
  }
  const pkgs: { _id: Types.ObjectId; price: number }[] = [];
  for (const p of PACKAGES) {
    const doc = await Package.collection.findOneAndUpdate(
      { company: cid, name: p.name },
      { $setOnInsert: { company: cid, ...p, validityDays: 30, router: router._id, isActive: true, ...stamp(new Date()) } },
      { upsert: true, returnDocument: "after" },
    );
    pkgs.push({ _id: doc!._id, price: doc!.price });
  }

  // Customers
  const startSeq = ((await Counter.collection.findOne({ company: cid, key: "customer" }))?.seq as number) ?? 0;
  const customers = Array.from({ length: 60 }, (_, i) => {
    const pkg = pkgs[i % 7 === 0 ? 3 : i % 3 === 0 ? 2 : i % 2 === 0 ? 1 : 0];
    const joined = new Date(now - (20 + Math.floor(rand() * 400)) * DAY);
    const roll = rand();
    const status = roll < 0.8 ? "active" : roll < 0.92 ? "expired" : roll < 0.97 ? "disabled" : "free";
    const expiry = new Date(now + (status === "active" ? 1 + Math.floor(rand() * 29) : -(1 + Math.floor(rand() * 20))) * DAY);
    const first = pick(FIRST);
    const username = `${first.toLowerCase()}${100 + i}`;
    return {
      _id: new Types.ObjectId(),
      company: cid,
      customerId: `C-${pad(startSeq + i + 1)}`,
      name: `${first} ${pick(LAST)}`,
      phone: `017${String(10000000 + Math.floor(rand() * 89999999))}`,
      address: `House ${1 + Math.floor(rand() * 90)}, Road ${1 + Math.floor(rand() * 12)}`,
      zone: zoneIds[i % zoneIds.length],
      connectionType: "pppoe",
      pppoe: { username, password: encrypt("123456") },
      package: pkg._id,
      router: router._id,
      monthlyFee: pkg.price,
      discount: 0,
      billingType: i % 15 === 0 ? "postpaid" : "prepaid",
      expiryDate: expiry,
      dueAmount: status === "expired" ? pkg.price : 0,
      balance: 0,
      status,
      autoDisable: true,
      connectionDate: joined,
      syncStatus: "synced",
      reseller: null,
      pendingPackage: null,
      deletedAt: null,
      ...stamp(joined),
    };
  });
  await Customer.collection.insertMany(customers);
  await Counter.collection.updateOne({ company: cid, key: "customer" }, { $set: { seq: startSeq + customers.length } }, { upsert: true });

  // Payments over the last 45 days
  const paying = customers.filter((c) => c.status !== "free");
  const receiptStart = ((await Counter.collection.findOne({ company: cid, key: "receipt" }))?.seq as number) ?? 0;
  const payments = [];
  for (let d = 45; d >= 0; d--) {
    const count = 1 + Math.floor(rand() * 4);
    for (let k = 0; k < count; k++) {
      const c = pick(paying);
      const at = new Date(now - d * DAY - Math.floor(rand() * 8) * 3_600_000);
      const method = pick(["cash", "cash", "bkash", "bkash", "nagad", "sslcommerz"] as const);
      payments.push({
        company: cid,
        receiptNo: `R-${pad(receiptStart + payments.length + 1)}`,
        customer: c._id,
        type: "recharge",
        amount: c.monthlyFee,
        billAmount: c.monthlyFee,
        vat: 0,
        discount: 0,
        months: 1,
        method,
        trxId: method === "cash" ? undefined : `DM${Math.floor(rand() * 1e9)}`,
        previousDue: 0,
        dueAfter: 0,
        receivedBy: method === "sslcommerz" ? undefined : pick(collectors),
        source: method === "sslcommerz" ? "online" : "staff",
        status: "success",
        reseller: null,
        invoices: [],
        ...stamp(at),
      });
    }
  }
  await Payment.collection.insertMany(payments);
  await Counter.collection.updateOne({ company: cid, key: "receipt" }, { $set: { seq: receiptStart + payments.length } }, { upsert: true });

  // Support tickets
  const ticketStart = ((await Counter.collection.findOne({ company: cid, key: "ticket" }))?.seq as number) ?? 0;
  const tickets = TICKETS.map(([category, subject, priority], i) => {
    const at = new Date(now - i * 1.5 * DAY);
    return {
      company: cid,
      ticketNo: `T-${pad(ticketStart + i + 1)}`,
      customer: customers[i * 7]._id,
      category,
      subject,
      priority,
      source: pick(["office", "phone", "portal"] as const),
      status: i < 2 ? "open" : i < 4 ? "in_progress" : "solved",
      assignedTo: i < 2 ? null : technician,
      comments: [],
      ...stamp(at),
    };
  });
  await Ticket.collection.insertMany(tickets);
  await Counter.collection.updateOne({ company: cid, key: "ticket" }, { $set: { seq: ticketStart + tickets.length } }, { upsert: true });

  // Expenses for this month and the two before
  const entries = [];
  for (let m = 0; m < 3; m++) {
    for (const [category, amount] of EXPENSES) {
      const date = new Date(now - (m * 30 + 3 + Math.floor(rand() * 20)) * DAY);
      entries.push({ company: cid, type: "expense", category, amount: Math.round(amount * (0.9 + rand() * 0.2)), date, method: "cash", source: "manual", ...stamp(date) });
    }
  }
  await LedgerEntry.collection.insertMany(entries);

  await Company.collection.updateOne({ _id: cid }, { $set: { "usage.customers": await Customer.collection.countDocuments({ company: cid, deletedAt: null }) } });
  console.log(`✅ ${company.name}: ${customers.length} customers, ${payments.length} payments, ${tickets.length} tickets, ${entries.length} expenses`);
}

connectDB()
  .then(() => main(process.argv[2] ?? "company1"))
  .then(disconnectDB)
  .catch(async (e) => {
    console.error("❌", e);
    await disconnectDB().catch(() => undefined);
    process.exit(1);
  });
