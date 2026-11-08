import { describe, expect, it } from "vitest";
import { expireCustomers } from "../../jobs/expireCustomers.job";
import { retryFailedSyncs } from "../../jobs/retrySync.job";
import { fakeRouter } from "../../../tests/fakeRouter";
import { api, signupTenant } from "../../../tests/helpers";
import { Customer } from "./customer.model";
import { Setting } from "../setting/setting.model";

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const DAY = 86_400_000;

async function setupIsp(host = "r1.test") {
  const t = await signupTenant();
  const auth = bearer(t.token);
  const zone = await api().post("/api/v1/zones").set(auth).send({ name: "Mirpur" });
  const router = await api()
    .post("/api/v1/routers")
    .set(auth)
    .send({ name: "Core", host, username: "admin", password: "routerpass" });
  const pkg = await api()
    .post("/api/v1/packages")
    .set(auth)
    .send({ name: "10 Mbps", speedDown: 10, speedUp: 10, price: 500, validityDays: 30, router: router.body.data._id, mikrotikProfile: "10M" });
  expect([zone.status, router.status, pkg.status]).toEqual([201, 201, 201]);
  return { ...t, auth, zoneId: zone.body.data._id, routerId: router.body.data._id, packageId: pkg.body.data._id, host };
}

async function createCustomer(ctx: Awaited<ReturnType<typeof setupIsp>>, body: Record<string, unknown> = {}) {
  return api()
    .post("/api/v1/customers")
    .set(ctx.auth)
    .send({
      name: "Rahim Uddin",
      phone: "01711000001",
      pppoeUsername: "rahim",
      package: ctx.packageId,
      zone: ctx.zoneId,
      ...body,
    });
}

describe("routers", () => {
  it("tests the connection and lists PPP profiles; password is never returned", async () => {
    const ctx = await setupIsp();
    const test = await api().post(`/api/v1/routers/${ctx.routerId}/test`).set(ctx.auth);
    expect(test.status).toBe(200);
    expect(test.body.data.info.version).toBe("7.15");

    const profiles = await api().get(`/api/v1/routers/${ctx.routerId}/profiles`).set(ctx.auth);
    expect(profiles.body.data).toContain("10M");

    const list = await api().get("/api/v1/routers").set(ctx.auth);
    expect(list.body.data[0].password).toBeUndefined();
    expect(list.body.data[0].status).toBe("online");
  });

  it("marks the router offline when unreachable", async () => {
    const ctx = await setupIsp();
    fakeRouter(ctx.host).reachable = false;
    const test = await api().post(`/api/v1/routers/${ctx.routerId}/test`).set(ctx.auth);
    expect(test.status).toBe(502);
    const r = await api().get(`/api/v1/routers/${ctx.routerId}`).set(ctx.auth);
    expect(r.body.data.status).toBe("offline");
  });

  it("enforces the plan's router limit (trial = 1)", async () => {
    const ctx = await setupIsp();
    const res = await api()
      .post("/api/v1/routers")
      .set(ctx.auth)
      .send({ name: "Second", host: "r2.test", username: "admin", password: "x" });
    expect(res.status).toBe(403);
  });
});

describe("customers", () => {
  it("creates a customer, generates a password and pushes the secret to MikroTik", async () => {
    const ctx = await setupIsp();
    const res = await createCustomer(ctx, { expiryDate: new Date(Date.now() + 10 * DAY) });
    expect(res.status).toBe(201);
    const { customer, generatedPassword, sync } = res.body.data;
    expect(customer.customerId).toBe("C-00001");
    expect(customer.status).toBe("active");
    expect(customer.monthlyFee).toBe(500);
    expect(customer.pppoe.password).toBeUndefined();
    expect(sync.ok).toBe(true);
    expect(generatedPassword).toHaveLength(8);

    const secret = fakeRouter(ctx.host).secrets.get("rahim");
    expect(secret).toMatchObject({ profile: "10M", disabled: false, password: generatedPassword });

    const creds = await api().get(`/api/v1/customers/${customer._id}/credentials`).set(ctx.auth);
    expect(creds.body.data.password).toBe(generatedPassword);
  });

  it("new customer without expiry starts expired and disabled on the router", async () => {
    const ctx = await setupIsp();
    const res = await createCustomer(ctx);
    expect(res.body.data.customer.status).toBe("expired");
    expect(fakeRouter(ctx.host).secrets.get("rahim")?.disabled).toBe(true);
  });

  it("rejects duplicate PPPoE usernames but allows reuse after the customer leaves", async () => {
    const ctx = await setupIsp();
    const first = await createCustomer(ctx);
    expect((await createCustomer(ctx, { phone: "01711000002" })).status).toBe(409);

    const del = await api().delete(`/api/v1/customers/${first.body.data.customer._id}`).set(ctx.auth);
    expect(del.status).toBe(200);
    expect(fakeRouter(ctx.host).secrets.has("rahim")).toBe(false);

    const again = await createCustomer(ctx, { phone: "01711000002" });
    expect(again.status).toBe(201);
    expect(again.body.data.customer.customerId).toBe("C-00002");
  });

  it("disable kicks the live session; enable restores billing status", async () => {
    const ctx = await setupIsp();
    const c = await createCustomer(ctx, { expiryDate: new Date(Date.now() + 10 * DAY) });
    const id = c.body.data.customer._id;
    fakeRouter(ctx.host).active.set("rahim", { name: "rahim", address: "10.0.0.5" });

    const live = await api().get(`/api/v1/customers/${id}/live`).set(ctx.auth);
    expect(live.body.data.online).toBe(true);

    const dis = await api().patch(`/api/v1/customers/${id}/disable`).set(ctx.auth);
    expect(dis.body.data.customer.status).toBe("disabled");
    expect(fakeRouter(ctx.host).secrets.get("rahim")?.disabled).toBe(true);
    expect(fakeRouter(ctx.host).active.has("rahim")).toBe(false);

    const en = await api().patch(`/api/v1/customers/${id}/enable`).set(ctx.auth);
    expect(en.body.data.customer.status).toBe("active");
    expect(fakeRouter(ctx.host).secrets.get("rahim")?.disabled).toBe(false);
  });

  it("renaming the PPPoE username renames the secret on the router", async () => {
    const ctx = await setupIsp();
    const c = await createCustomer(ctx, { expiryDate: new Date(Date.now() + DAY) });
    const res = await api()
      .patch(`/api/v1/customers/${c.body.data.customer._id}`)
      .set(ctx.auth)
      .send({ pppoeUsername: "rahim2" });
    expect(res.status).toBe(200);
    const secrets = fakeRouter(ctx.host).secrets;
    expect(secrets.has("rahim")).toBe(false);
    expect(secrets.get("rahim2")?.profile).toBe("10M");
  });

  it("stores a failed sync when the router is down and the retry job fixes it", async () => {
    const ctx = await setupIsp();
    fakeRouter(ctx.host).reachable = false;
    const res = await createCustomer(ctx, { expiryDate: new Date(Date.now() + DAY) });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/router sync failed/);
    expect(res.body.data.customer.syncStatus).toBe("failed");

    fakeRouter(ctx.host).reachable = true;
    await Customer.updateMany({}, { $set: { updatedAt: new Date(Date.now() - 10 * 60_000) } }, { timestamps: false });
    const result = await retryFailedSyncs();
    expect(result).toEqual({ attempted: 1, fixed: 1 });
    expect(fakeRouter(ctx.host).secrets.has("rahim")).toBe(true);
  });

  it("zone list counts the customers in each zone", async () => {
    const ctx = await setupIsp();
    const other = await api().post("/api/v1/zones").set(ctx.auth).send({ name: "Uttara" });
    await createCustomer(ctx);
    await createCustomer(ctx, { phone: "01711000002", pppoeUsername: "karim" });
    await createCustomer(ctx, { phone: "01711000003", pppoeUsername: "salam", zone: other.body.data._id });

    const zones = await api().get("/api/v1/zones").set(ctx.auth);
    const count = (id: string) => zones.body.data.find((z: { _id: string }) => z._id === id)?.customerCount;
    expect(count(ctx.zoneId)).toBe(2);
    expect(count(other.body.data._id)).toBe(1);
  });

  it("collectors only see customers in their zones", async () => {
    const ctx = await setupIsp();
    const other = await api().post("/api/v1/zones").set(ctx.auth).send({ name: "Uttara" });
    await createCustomer(ctx);
    await createCustomer(ctx, { phone: "01711000002", pppoeUsername: "karim", zone: other.body.data._id });

    await api()
      .post("/api/v1/users")
      .set(ctx.auth)
      .send({ name: "Col", phone: "01900000001", role: "collector", password: "Staff1234", zones: [ctx.zoneId] });
    const login = await api().post("/api/v1/auth/login").send({ identifier: "01900000001", password: "Staff1234" });
    const col = bearer(login.body.data.accessToken);

    const list = await api().get("/api/v1/customers").set(col);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].pppoe.username).toBe("rahim");

    const forbidden = await api().get("/api/v1/customers").query({ zone: other.body.data._id }).set(col);
    expect(forbidden.body.meta.total).toBe(0);

    const create = await createCustomer({ ...ctx, auth: col }, { phone: "01711000003", pppoeUsername: "x1" });
    expect(create.status).toBe(403);
  });

  it("another tenant cannot see or recharge this tenant's customers", async () => {
    const a = await setupIsp("a.test");
    const b = await setupIsp("b.test");
    const c = await createCustomer(a);
    const id = c.body.data.customer._id;
    expect((await api().get(`/api/v1/customers/${id}`).set(b.auth)).status).toBe(404);
    expect((await api().post("/api/v1/payments/recharge").set(b.auth).send({ customer: id })).status).toBe(404);
    expect((await api().get("/api/v1/customers").set(b.auth)).body.meta.total).toBe(0);
  });
});

describe("recharge", () => {
  it("recharging an expired customer extends from today, enables the secret and issues a receipt", async () => {
    const ctx = await setupIsp();
    const c = await createCustomer(ctx, { expiryDate: new Date(Date.now() - 5 * DAY) });
    const id = c.body.data.customer._id;
    expect(fakeRouter(ctx.host).secrets.get("rahim")?.disabled).toBe(true);

    const res = await api().post("/api/v1/payments/recharge").set(ctx.auth).send({ customer: id, months: 2 });
    expect(res.status).toBe(201);
    const p = res.body.data.payment;
    expect(p.receiptNo).toBe("R-00001");
    expect(p.amount).toBe(1000);
    expect(p.dueAfter).toBe(0);
    expect(p.company.name).toBeTruthy();
    const days = (new Date(p.newExpiry).getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(59.9);
    expect(days).toBeLessThan(60.1);

    expect(fakeRouter(ctx.host).secrets.get("rahim")?.disabled).toBe(false);
    const after = await api().get(`/api/v1/customers/${id}`).set(ctx.auth);
    expect(after.body.data.status).toBe("active");
  });

  it("recharging an active customer extends from the current expiry", async () => {
    const ctx = await setupIsp();
    const expiry = new Date(Date.now() + 10 * DAY);
    const c = await createCustomer(ctx, { expiryDate: expiry });
    const res = await api()
      .post("/api/v1/payments/recharge")
      .set(ctx.auth)
      .send({ customer: c.body.data.customer._id, months: 1 });
    expect(new Date(res.body.data.payment.newExpiry).getTime()).toBe(expiry.getTime() + 30 * DAY);
  });

  it("partial payment leaves a due; overpayment becomes advance balance", async () => {
    const ctx = await setupIsp();
    const c = await createCustomer(ctx);
    const id = c.body.data.customer._id;

    const partial = await api().post("/api/v1/payments/recharge").set(ctx.auth).send({ customer: id, amount: 300 });
    expect(partial.body.data.payment.dueAfter).toBe(200);

    // next month: bill 500 + previous due 200 = 700, pay 1000 → 300 advance
    await api().post("/api/v1/payments/recharge").set(ctx.auth).send({ customer: id, amount: 1000 });
    const cust = await api().get(`/api/v1/customers/${id}`).set(ctx.auth);
    expect(cust.body.data.dueAmount).toBe(0);
    expect(cust.body.data.balance).toBe(300);

    // advance balance is used automatically: bill 500 − 300 advance = 200 to pay
    const third = await api().post("/api/v1/payments/recharge").set(ctx.auth).send({ customer: id });
    expect(third.body.data.payment.amount).toBe(200);
  });

  it("requires a transaction id for bKash", async () => {
    const ctx = await setupIsp();
    const c = await createCustomer(ctx);
    const res = await api()
      .post("/api/v1/payments/recharge")
      .set(ctx.auth)
      .send({ customer: c.body.data.customer._id, method: "bkash" });
    expect(res.status).toBe(400);
  });

  it("collectors see only their own collections; dashboard sums today's total", async () => {
    const ctx = await setupIsp();
    const c = await createCustomer(ctx);
    await api().post("/api/v1/payments/recharge").set(ctx.auth).send({ customer: c.body.data.customer._id });

    const list = await api().get("/api/v1/payments").set(ctx.auth);
    expect(list.body.totals).toEqual({ amount: 500, count: 1 });

    const dash = await api().get("/api/v1/dashboard").set(ctx.auth);
    expect(dash.body.data.collection.today.amount).toBe(500);
    expect(dash.body.data.customers.active).toBe(1);

    await api()
      .post("/api/v1/users")
      .set(ctx.auth)
      .send({ name: "Col", phone: "01900000001", role: "collector", password: "Staff1234" });
    const login = await api().post("/api/v1/auth/login").send({ identifier: "01900000001", password: "Staff1234" });
    const colList = await api().get("/api/v1/payments").set(bearer(login.body.data.accessToken));
    expect(colList.body.meta.total).toBe(0);
  });
});

describe("auto expire job", () => {
  it("disables expired customers after the grace period and kicks them", async () => {
    const ctx = await setupIsp();
    const c = await createCustomer(ctx, { expiryDate: new Date(Date.now() + DAY) });
    fakeRouter(ctx.host).active.set("rahim", { name: "rahim" });

    // not yet expired
    expect((await expireCustomers()).expired).toBe(0);

    // 2 days later, with 1 grace day → expire
    await Setting.updateOne({ company: ctx.companyId }, { $set: { "billing.graceDays": 1 } }, { upsert: true });
    const later = new Date(Date.now() + 2 * DAY + 60_000);
    const result = await expireCustomers(later);
    expect(result.expired).toBe(1);

    const customer = await Customer.findById(c.body.data.customer._id);
    expect(customer?.status).toBe("expired");
    expect(customer?.syncStatus).toBe("synced");
    expect(fakeRouter(ctx.host).secrets.get("rahim")?.disabled).toBe(true);
    expect(fakeRouter(ctx.host).active.has("rahim")).toBe(false);
  });

  it("skips free customers and suspended companies", async () => {
    const ctx = await setupIsp();
    await createCustomer(ctx, { isFree: true });
    await createCustomer(ctx, { phone: "01711000002", pppoeUsername: "karim", expiryDate: new Date(Date.now() - DAY) });
    // karim starts expired already; make him "active but overdue" to test suspension skip
    await Customer.updateOne({ "pppoe.username": "karim" }, { status: "active" });

    const { Company } = await import("../company/company.model");
    await Company.updateOne({ _id: ctx.companyId }, { status: "suspended" });
    expect((await expireCustomers()).expired).toBe(0);

    await Company.updateOne({ _id: ctx.companyId }, { status: "active" });
    expect((await expireCustomers()).expired).toBe(1);
    const free = await Customer.findOne({ "pppoe.username": "rahim" });
    expect(free?.status).toBe("free");
  });
});
