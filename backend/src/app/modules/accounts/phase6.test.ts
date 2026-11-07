import { describe, expect, it } from "vitest";
import { api } from "../../../tests/helpers";
import { addStaff, bearer, createCustomer, DAY, setupIsp } from "../../../tests/isp";
import { expireCustomers } from "../../jobs/expireCustomers.job";
import { runWithTenant } from "../../utils/tenantContext";
import { Customer } from "../customer/customer.model";
import { CustomerInvoice } from "../invoice/invoice.model";
import { issueMonthlyInvoices } from "../invoice/invoice.service";
import { Plan } from "../plan/plan.model";
import { Subscription } from "../subscription/subscription.model";

describe("accounts: expenses and profit & loss", () => {
  it("adds bills collected and income, subtracts expenses", async () => {
    const isp = await setupIsp();
    const c = await createCustomer(isp);
    await api().post("/api/v1/payments/recharge").set(isp.auth).send({ customer: c.body.data.customer._id, months: 2 }).expect(201); // 1000
    await api().post("/api/v1/accounts/entries").set(isp.auth).send({ type: "expense", category: "Bandwidth", amount: 300 }).expect(201);
    const rent = await api().post("/api/v1/accounts/entries").set(isp.auth).send({ type: "expense", category: "Office rent", amount: 200, method: "bank" });
    await api().post("/api/v1/accounts/entries").set(isp.auth).send({ type: "income", category: "Installation", amount: 50 }).expect(201);

    const pnl = await api().get("/api/v1/accounts/pnl").set(isp.auth);
    expect(pnl.status).toBe(200);
    expect(pnl.body.data.income.total).toBe(1050);
    expect(pnl.body.data.expense.total).toBe(500);
    expect(pnl.body.data.net).toBe(550);
    expect(pnl.body.data.monthly.at(-1)).toMatchObject({ income: 1050, expense: 500, net: 550 });

    await api().patch(`/api/v1/accounts/entries/${rent.body.data._id}`).set(isp.auth).send({ amount: 250 }).expect(200);
    const list = await api().get("/api/v1/accounts/entries").query({ type: "expense" }).set(isp.auth);
    expect(list.body.data.totals.expense).toBe(550);

    const cats = await api().get("/api/v1/accounts/categories").set(isp.auth);
    expect(cats.body.data.expense).toContain("Bandwidth");

    // collectors cannot see the books
    const col = await addStaff(isp, { role: "collector", phone: "01811000123" });
    expect((await api().get("/api/v1/accounts/pnl").set(col.auth)).status).toBe(403);
  });
});

describe("resellers", () => {
  it("reseller buys balance, recharges own customers from it, sees only their customers", async () => {
    const isp = await setupIsp();
    const own = await createCustomer(isp);
    const r = await api().post("/api/v1/resellers").set(isp.auth).send({ name: "Mirpur Net Point", phone: "01911000001", password: "Reseller1", discountPercent: 20 });
    expect(r.status).toBe(201);
    const rid = r.body.data._id;

    const login = await api().post("/api/v1/auth/login").send({ identifier: "01911000001", password: "Reseller1" });
    const ra = bearer(login.body.data.accessToken);

    // reseller creates a customer → it is theirs
    const rc = await api().post("/api/v1/customers").set(ra).send({ name: "Jamal", phone: "01711000077", pppoeUsername: "jamal", package: isp.packageId, zone: isp.zoneId });
    expect(rc.status).toBe(201);
    expect(rc.body.data.customer.reseller).toBe(rid);
    const listed = await api().get("/api/v1/customers").set(ra);
    expect(listed.body.data.map((c: { name: string }) => c.name)).toEqual(["Jamal"]);
    // regression: the reseller dashboard used to count 0 (string id in aggregate)
    const dash = await api().get("/api/v1/dashboard").set(ra);
    expect(dash.body.data.customers.total).toBe(1);
    expect(dash.body.data.trend).toHaveLength(14);
    expect((await api().get(`/api/v1/customers/${own.body.data.customer._id}`).set(ra)).status).toBe(404);

    // no balance yet
    const fail = await api().post("/api/v1/payments/recharge").set(ra).send({ customer: rc.body.data.customer._id, months: 1 });
    expect(fail.status).toBe(402);

    // ISP takes 1000 from the reseller
    const dep = await api().post(`/api/v1/resellers/${rid}/deposit`).set(isp.auth).send({ amount: 1000, method: "bkash" });
    expect(dep.status).toBe(201);
    expect(dep.body.data.reseller.balance).toBe(1000);

    const ok = await api().post("/api/v1/payments/recharge").set(ra).send({ customer: rc.body.data.customer._id, months: 2 });
    expect(ok.status).toBe(201);
    expect(ok.body.data.payment.resellerCost).toBe(800); // 2 × (500 − 20%)
    const me = await api().get("/api/v1/resellers/me").set(ra);
    expect(me.body.data.reseller.balance).toBe(200);
    expect(me.body.data.recent.map((t: { type: string }) => t.type)).toEqual(["recharge", "deposit"]);

    // P&L: the deposit is ISP income, the reseller's customer payment is not
    const pnl = await api().get("/api/v1/accounts/pnl").set(isp.auth);
    expect(pnl.body.data.income.total).toBe(1000);

    const list = await api().get("/api/v1/resellers").set(isp.auth);
    expect(list.body.data[0].customers).toMatchObject({ total: 1, active: 1 });
  });

  it("is limited by the plan", async () => {
    const isp = await setupIsp();
    await Plan.updateOne({ slug: "trial" }, { "limits.resellers": 1 });
    await api().post("/api/v1/resellers").set(isp.auth).send({ name: "Area A", phone: "01911000001", password: "Reseller1" }).expect(201);
    expect((await api().post("/api/v1/resellers").set(isp.auth).send({ name: "Area B", phone: "01911000002", password: "Reseller1" })).status).toBe(403);
    const starter = await Plan.findOne({ slug: "starter" });
    await Subscription.updateOne({ company: isp.companyId }, { plan: starter!._id, status: "active", currentPeriodEnd: new Date(Date.now() + 20 * DAY) });
    expect((await api().get("/api/v1/resellers").set(isp.auth)).status).toBe(403);
  });
});

describe("postpaid billing", () => {
  it("invoices monthly, cuts off when overdue, settles oldest invoice first", async () => {
    const isp = await setupIsp();
    const c = await createCustomer(isp, { billingType: "postpaid" });
    const id = c.body.data.customer._id;
    expect(c.body.data.customer.status).toBe("active");

    const jan = new Date("2026-01-03T10:00:00+06:00");
    const feb = new Date("2026-02-03T10:00:00+06:00");
    await runWithTenant(isp.companyId, () => issueMonthlyInvoices(isp.companyId, jan));
    await runWithTenant(isp.companyId, () => issueMonthlyInvoices(isp.companyId, jan)); // idempotent
    await runWithTenant(isp.companyId, () => issueMonthlyInvoices(isp.companyId, feb));
    expect(await CustomerInvoice.countDocuments({ customer: id })).toBe(2);
    expect((await Customer.findById(id))!.dueAmount).toBe(1000);

    // Jan invoice is long overdue → disconnected
    await expireCustomers(new Date("2026-02-20T10:00:00+06:00"));
    expect((await Customer.findById(id))!.status).toBe("expired");

    // pay 700: Jan paid, Feb partial; still due → stays off
    const p1 = await api().post("/api/v1/payments/recharge").set(isp.auth).send({ customer: id, amount: 700 });
    expect(p1.status).toBe(201);
    const invs = await CustomerInvoice.find({ customer: id }).sort("period");
    expect(invs.map((i) => [i.period, i.status, i.paid])).toEqual([
      ["2026-01", "paid", 500],
      ["2026-02", "partial", 200],
    ]);
    expect((await Customer.findById(id))!.status).toBe("expired");

    // pay the rest → reconnected
    await api().post("/api/v1/payments/recharge").set(isp.auth).send({ customer: id }).expect(201);
    const after = await Customer.findById(id);
    expect([after!.status, after!.dueAmount]).toEqual(["active", 0]);
    expect((await api().post("/api/v1/payments/recharge").set(isp.auth).send({ customer: id })).status).toBe(400); // nothing due

    const list = await api().get("/api/v1/invoices").query({ customer: id }).set(isp.auth);
    expect(list.body.meta.total).toBe(2);
  });
});

describe("employees, salary and cash handover", () => {
  it("pays salary into expenses and tracks cash in hand", async () => {
    const isp = await setupIsp();
    const emp = await api().post("/api/v1/employees").set(isp.auth).send({ name: "Line man Kalam", phone: "01611000001", designation: "Technician", monthlySalary: 12000 });
    expect(emp.status).toBe(201);
    await api().post("/api/v1/employees/salaries").set(isp.auth).send({ employee: emp.body.data._id, month: "2026-11", type: "advance", amount: 2000 }).expect(201);
    await api().post("/api/v1/employees/salaries").set(isp.auth).send({ employee: emp.body.data._id, month: "2026-11", amount: 9000, deduction: 500 }).expect(201);
    const sheet = await api().get("/api/v1/employees/salary-sheet").query({ month: "2026-11" }).set(isp.auth);
    expect(sheet.body.data.rows[0]).toMatchObject({ salary: 9000, advance: 2000, deduction: 500, remaining: 500, status: "partial" });
    const exp = await api().get("/api/v1/accounts/entries").query({ source: "salary" }).set(isp.auth);
    expect(exp.body.meta.total).toBe(2);

    // collector collects 1000 cash, hands 600 to the owner
    const col = await addStaff(isp, { role: "collector", phone: "01811000124" });
    const c = await createCustomer(isp);
    await api().post("/api/v1/payments/recharge").set(col.auth).send({ customer: c.body.data.customer._id, months: 2 }).expect(201);
    expect((await api().get("/api/v1/collections/me").set(col.auth)).body.data.inHand).toBe(1000);
    expect((await api().post("/api/v1/collections/handovers").set(col.auth).send({ to: isp.userId, amount: 1500 })).status).toBe(400);
    const h = await api().post("/api/v1/collections/handovers").set(col.auth).send({ to: isp.userId, amount: 600 });
    expect(h.status).toBe(201);
    expect((await api().get("/api/v1/collections/me").set(col.auth)).body.data.inHand).toBe(400);
    // only the receiver confirms
    expect((await api().post(`/api/v1/collections/handovers/${h.body.data._id}/decide`).set(col.auth).send({ accept: true })).status).toBe(403);
    await api().post(`/api/v1/collections/handovers/${h.body.data._id}/decide`).set(isp.auth).send({ accept: true }).expect(200);
    const sum = await api().get("/api/v1/collections/summary").set(isp.auth);
    const owner = sum.body.data.find((r: { user: { _id: string } }) => r.user._id === isp.userId);
    expect(owner.inHand).toBe(600);
  });
});

describe("inventory", () => {
  it("purchases with serials, issues to a customer, blocks overselling", async () => {
    const isp = await setupIsp();
    expect((await api().get("/api/v1/inventory/items").set(isp.auth)).status).toBe(403); // not in trial
    const pro = await Plan.findOne({ slug: "pro" });
    await Subscription.updateOne({ company: isp.companyId }, { plan: pro!._id, status: "active", currentPeriodEnd: new Date(Date.now() + 20 * DAY) });
    const c = await createCustomer(isp);
    const item = await api().post("/api/v1/inventory/items").set(isp.auth).send({ name: "Xiaomi 4A router", category: "router", trackSerials: true, minStock: 1 });
    expect(item.status).toBe(201);
    const iid = item.body.data._id;

    expect((await api().post("/api/v1/inventory/movements").set(isp.auth).send({ item: iid, type: "in", quantity: 2, unitCost: 1800, serials: ["AA:01"] })).status).toBe(400);
    await api().post("/api/v1/inventory/movements").set(isp.auth).send({ item: iid, type: "in", quantity: 2, unitCost: 1800, serials: ["AA:01", "AA:02"], supplier: "Ryans" }).expect(201);
    const out = await api().post("/api/v1/inventory/movements").set(isp.auth).send({ item: iid, type: "out", quantity: 1, serials: ["AA:02"], customer: c.body.data.customer._id });
    expect(out.status).toBe(201);
    expect(out.body.data.stockAfter).toBe(1);
    expect((await api().post("/api/v1/inventory/movements").set(isp.auth).send({ item: iid, type: "out", quantity: 1, serials: ["AA:02"] })).status).toBe(400); // already issued

    const sum = await api().get("/api/v1/inventory/summary").set(isp.auth);
    expect(sum.body.data).toMatchObject({ stockValue: 1800, items: 1 });
    expect(sum.body.data.lowStock).toHaveLength(1);
    const exp = await api().get("/api/v1/accounts/entries").query({ source: "inventory" }).set(isp.auth);
    expect(exp.body.data.totals.expense).toBe(3600);

    const cable = await api().post("/api/v1/inventory/items").set(isp.auth).send({ name: "Drop cable", category: "fiber_cable", unit: "meter" });
    await api().post("/api/v1/inventory/movements").set(isp.auth).send({ item: cable.body.data._id, type: "in", quantity: 100, unitCost: 8, recordExpense: false }).expect(201);
    expect((await api().post("/api/v1/inventory/movements").set(isp.auth).send({ item: cable.body.data._id, type: "out", quantity: 150 })).status).toBe(400);
  });
});
