import { describe, expect, it } from "vitest";
import { api } from "../../../tests/helpers";
import { fakeSms } from "../../../tests/fakeSms";
import { fakeRouter } from "../../../tests/fakeRouter";
import { bearer, createCustomer, DAY, Isp, setupIsp } from "../../../tests/isp";
import { sendExpiryReminders } from "../../jobs/expiryReminder.job";
import { flushBackground } from "../../utils/background";
import { Company } from "../company/company.model";
import { Plan } from "../plan/plan.model";
import { Subscription } from "../subscription/subscription.model";

const P = "/api/v1/portal";
const codeFrom = (msg: string) => /(\d{6})/.exec(msg)![1];

async function portalLogin(isp: Isp, phone = "01711000001") {
  await flushBackground();
  fakeSms.reset();
  const otp = await api().post(`${P}/isp/${isp.body.slug}/otp`).send({ phone: `+88${phone}` });
  expect(otp.status).toBe(200);
  expect(fakeSms.sent).toHaveLength(1);
  const verify = await api().post(`${P}/isp/${isp.body.slug}/verify`).send({ phone, code: codeFrom(fakeSms.sent[0].message) });
  expect(verify.status).toBe(200);
  return bearer(verify.body.data.accessToken);
}

describe("customer portal login", () => {
  it("logs in with an SMS code; unknown numbers get the same answer but no SMS", async () => {
    const isp = await setupIsp();
    await createCustomer(isp);
    await flushBackground();
    const before = (await Company.findById(isp.companyId))!.smsBalance;

    const info = await api().get(`${P}/isp/${isp.body.slug}`);
    expect(info.body.data).toMatchObject({ name: isp.body.companyName, onlinePayment: true, tickets: true });

    fakeSms.reset();
    const unknown = await api().post(`${P}/isp/${isp.body.slug}/otp`).send({ phone: "01799999999" });
    expect(unknown.status).toBe(200);
    expect(fakeSms.sent).toHaveLength(0);

    const auth = await portalLogin(isp);
    expect((await Company.findById(isp.companyId))!.smsBalance).toBe(before - 1); // paid from the ISP's SMS wallet

    // a used code cannot be replayed; a new code cannot be re-sent within a minute; wrong codes fail
    const used = codeFrom(fakeSms.sent[0].message);
    expect((await api().post(`${P}/isp/${isp.body.slug}/verify`).send({ phone: "01711000001", code: used })).status).toBe(400);
    await api().post(`${P}/isp/${isp.body.slug}/otp`).send({ phone: "01711000001" }).expect(200);
    await api().post(`${P}/isp/${isp.body.slug}/otp`).send({ phone: "01711000001" }).expect(429);
    const fresh = codeFrom(fakeSms.sent[1].message);
    const wrong = fresh === "000000" ? "111111" : "000000";
    expect((await api().post(`${P}/isp/${isp.body.slug}/verify`).send({ phone: "01711000001", code: wrong })).status).toBe(400);

    const me = await api().get(`${P}/me`).set(auth);
    expect(me.status).toBe(200);
    expect(me.body.data.accounts).toHaveLength(1);
    expect(me.body.data.accounts[0]).toMatchObject({ name: "Rahim Uddin", package: { name: "10 Mbps" } });
    expect(JSON.stringify(me.body)).not.toContain("password");

    // portal tokens are not staff tokens
    expect((await api().get("/api/v1/customers").set(auth)).status).toBe(403);
  });

  it("is locked on plans without the portal and isolated between ISPs", async () => {
    const a = await setupIsp("a.test");
    const b = await setupIsp("b.test");
    await createCustomer(a);
    const bc = await createCustomer(b, { phone: "01711000009", pppoeUsername: "bcust" });
    const auth = await portalLogin(a);

    // a customer of ISP A cannot read ISP B's connection
    expect((await api().get(`${P}/accounts/${bc.body.data.customer._id}/payments`).set(auth)).status).toBe(404);

    const starter = await Plan.findOne({ slug: "starter" });
    await Subscription.updateOne({ company: a.companyId }, { plan: starter!._id, status: "active", currentPeriodEnd: new Date(Date.now() + 20 * DAY) });
    expect((await api().get(`${P}/isp/${a.body.slug}`)).status).toBe(404);
    expect((await api().get(`${P}/me`).set(auth)).status).toBe(403);
  });

  it("explains when the ISP cannot send the SMS", async () => {
    const isp = await setupIsp();
    await createCustomer(isp);
    await flushBackground();
    await Company.updateOne({ _id: isp.companyId }, { smsBalance: 0 });
    const r = await api().post(`${P}/isp/${isp.body.slug}/otp`).send({ phone: "01711000001" });
    expect(r.status).toBe(503);
    expect(r.body.message).toContain(isp.body.companyName);
  });
});

describe("portal: one number, several connections, payments and complaints", () => {
  it("shows every connection with the number, payment history and handles complaints", async () => {
    const isp = await setupIsp();
    const home = await createCustomer(isp);
    const shop = await createCustomer(isp, { name: "Rahim Store", pppoeUsername: "rahim-shop" });
    await api().post("/api/v1/payments/recharge").set(isp.auth).send({ customer: home.body.data.customer._id, months: 1 }).expect(201);
    const auth = await portalLogin(isp);

    const me = await api().get(`${P}/me`).set(auth);
    expect(me.body.data.accounts.map((c: { name: string }) => c.name).sort()).toEqual(["Rahim Store", "Rahim Uddin"]);
    expect(me.body.data.payUrl).toContain(`/pay/${isp.body.slug}`);

    const pays = await api().get(`${P}/accounts/${home.body.data.customer._id}/payments`).set(auth);
    expect(pays.body.data).toHaveLength(1);
    expect(pays.body.data[0].amount).toBe(500);

    const t = await api().post(`${P}/tickets`).set(auth).send({ account: shop.body.data.customer._id, category: "no_internet", subject: "No internet since morning" });
    expect(t.status).toBe(201);
    expect(t.body.data).toMatchObject({ source: "portal", priority: "high" });
    expect((await api().post(`${P}/tickets`).set(auth).send({ account: shop.body.data.customer._id, subject: "No internet since morning" })).status).toBe(409);

    // staff see it, notification went out, staff solve it
    const staffList = await api().get("/api/v1/tickets").set(isp.auth);
    expect(staffList.body.data[0].ticketNo).toBe(t.body.data.ticketNo);
    const notes = await api().get("/api/v1/notifications").set(isp.auth);
    expect(notes.body.data.items[0].title).toContain("(portal)");
    await api().patch(`/api/v1/tickets/${t.body.data._id}/status`).set(isp.auth).send({ status: "solved" }).expect(200);

    // customer says it's not fixed → re-opened, comment marked as from the customer
    const c = await api().post(`${P}/tickets/${t.body.data._id}/comments`).set(auth).send({ text: "Still not working" });
    expect(c.body.data.status).toBe("open");
    expect(c.body.data.comments.at(-1)).toMatchObject({ text: "Still not working", fromCustomer: true });

    const mine = await api().get(`${P}/tickets`).set(auth);
    expect(mine.body.data).toHaveLength(1);
  });
});

describe("links in SMS", () => {
  it("adds the pay link to reminders only when online payment is in the plan", async () => {
    const isp = await setupIsp();
    await api().patch("/api/v1/settings").set(isp.auth).send({ sms: { autoEvents: { welcome: false } } });
    await createCustomer(isp, { expiryDate: new Date(Date.now() + 2 * DAY) });
    await sendExpiryReminders();
    await flushBackground();
    expect(fakeSms.sent[0].message).toMatch(new RegExp(`/pay/${isp.body.slug}\\?c=[\\w-]+$`));

    fakeSms.reset();
    const starter = await Plan.findOne({ slug: "starter" });
    await Subscription.updateOne({ company: isp.companyId }, { plan: starter!._id, status: "active", currentPeriodEnd: new Date(Date.now() + 20 * DAY) });
    await createCustomer(isp, { name: "Karim", phone: "01711000002", pppoeUsername: "karim", expiryDate: new Date(Date.now() + 2 * DAY) });
    await sendExpiryReminders();
    await flushBackground();
    expect(fakeSms.sent).toHaveLength(1);
    expect(fakeSms.sent[0].message).not.toContain("/pay/");
    expect(fakeSms.sent[0].message).not.toContain("{pay_link}");
    expect(fakeSms.sent[0].message.endsWith(isp.body.companyName)).toBe(true);
  });
});

describe("portal: live usage and package change", () => {
  it("shows live session data and lets the customer request a package the ISP approves", async () => {
    const isp = await setupIsp();
    const c = await createCustomer(isp);
    const id = c.body.data.customer._id;
    const auth = await portalLogin(isp);

    expect((await api().get(`${P}/accounts/${id}/live`).set(auth)).body.data).toEqual({ supported: true, online: false });
    const r = fakeRouter(isp.host);
    r.active.set("rahim", { name: "rahim", address: "10.10.0.5", uptime: "2h" });
    r.traffic.set("rahim", { downloadBytes: 5_000_000_000, uploadBytes: 300_000_000 });
    expect((await api().get(`${P}/accounts/${id}/live`).set(auth)).body.data).toMatchObject({ online: true, ip: "10.10.0.5", uptime: "2h", downloadBytes: 5_000_000_000 });

    const pkg = await api().post("/api/v1/packages").set(isp.auth).send({ name: "20 Mbps", speedDown: 20, speedUp: 20, price: 800, validityDays: 30, router: isp.routerId, mikrotikProfile: "20M" });
    const list = await api().get(`${P}/accounts/${id}/packages`).set(auth);
    expect(list.body.data.map((p: { name: string }) => p.name)).toEqual(["10 Mbps", "20 Mbps"]);

    expect((await api().post(`${P}/accounts/${id}/package-request`).set(auth).send({ package: isp.packageId })).status).toBe(400); // same package
    const req = await api().post(`${P}/accounts/${id}/package-request`).set(auth).send({ package: pkg.body.data._id, note: "Need more speed" });
    expect(req.status).toBe(201);
    expect((await api().post(`${P}/accounts/${id}/package-request`).set(auth).send({ package: pkg.body.data._id })).status).toBe(409);

    const staff = await api().get("/api/v1/package-requests").set(isp.auth);
    expect(staff.body.data[0].toPackage.name).toBe("20 Mbps");
    const ok = await api().post(`/api/v1/package-requests/${req.body.data._id}/decide`).set(isp.auth).send({ approve: true });
    expect(ok.status).toBe(200);
    const me = await api().get(`${P}/me`).set(auth);
    expect(me.body.data.accounts[0]).toMatchObject({ monthlyFee: 800, package: { name: "20 Mbps" } });
    expect(r.secrets.get("rahim")?.profile).toBe("20M"); // pushed to the router
  });
});

describe("portal: PPPoE login, receipt, profile and password", () => {
  it("logs in with PPPoE credentials, limited to that one connection", async () => {
    const isp = await setupIsp();
    const home = await createCustomer(isp, { pppoePassword: "home-pass" });
    await createCustomer(isp, { name: "Rahim Store", pppoeUsername: "rahim-shop", pppoePassword: "shop-pass" }); // same phone
    await api().post("/api/v1/payments/recharge").set(isp.auth).send({ customer: home.body.data.customer._id, months: 1 }).expect(201);

    expect((await api().post(`${P}/isp/${isp.body.slug}/login`).send({ username: "rahim", password: "wrong" })).status).toBe(400);
    const login = await api().post(`${P}/isp/${isp.body.slug}/login`).send({ username: "rahim", password: "home-pass" });
    expect(login.status).toBe(200);
    const auth = bearer(login.body.data.accessToken);
    const me = await api().get(`${P}/me`).set(auth);
    expect(me.body.data.accounts.map((a: { name: string }) => a.name)).toEqual(["Rahim Uddin"]); // not the shop

    const pays = await api().get(`${P}/accounts/${home.body.data.customer._id}/payments`).set(auth);
    const rc = await api().get(`${P}/payments/${pays.body.data[0]._id}/receipt`).set(auth);
    expect(rc.body.data).toMatchObject({ amount: 500, company: { name: isp.body.companyName } });

    await api().patch(`${P}/accounts/${home.body.data.customer._id}/profile`).set(auth).send({ email: "rahim@example.com", altPhone: "01811000099" }).expect(200);
    expect((await api().post(`${P}/accounts/${home.body.data.customer._id}/password`).set(auth).send({ currentPassword: "nope", newPassword: "newpass1" })).status).toBe(400);
    const pw = await api().post(`${P}/accounts/${home.body.data.customer._id}/password`).set(auth).send({ currentPassword: "home-pass", newPassword: "newpass1" });
    expect(pw.status).toBe(200);
    expect(fakeRouter(isp.host).secrets.get("rahim")?.password).toBe("newpass1");
    expect((await api().post(`${P}/isp/${isp.body.slug}/login`).send({ username: "rahim", password: "newpass1" })).status).toBe(200);
  });
});
