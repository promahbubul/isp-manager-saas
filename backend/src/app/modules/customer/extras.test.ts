import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { api } from "../../../tests/helpers";
import { fakeRouter } from "../../../tests/fakeRouter";
import { bearer, createCustomer, DAY, setupIsp } from "../../../tests/isp";
import config from "../../config";
import { sendDailySummaries } from "../../jobs/dailySummary.job";
import { setEmailSender } from "../../services/email/email.service";
import { flushBackground } from "../../utils/background";
import { ActivityLog } from "../activityLog/activityLog.model";
import { Company } from "../company/company.model";
import { PaymentAttempt } from "../onlinePayment/paymentAttempt.model";
import { PlatformUser } from "../platformUser/platformUser.model";
import { ErrorLog, recordError } from "../system/errorLog.model";
import { Ticket } from "../ticket/ticket.model";
import { Customer } from "./customer.model";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b60000000049454e44ae426082", "hex");

async function admin() {
  await PlatformUser.create({ name: "SA", email: "sa@x.com", password: "Admin12345", role: "super_admin" });
  const r = await api().post("/api/v1/auth/admin/login").send({ email: "sa@x.com", password: "Admin12345" });
  return bearer(r.body.data.accessToken);
}

afterEach(() => setEmailSender(null));

describe("customer extras", () => {
  it("logs field changes, timeline, bulk disable, extra charges and VAT", async () => {
    const isp = await setupIsp();
    const c = await createCustomer(isp);
    const id = c.body.data.customer._id;
    await api().patch(`/api/v1/customers/${id}`).set(isp.auth).send({ address: "Mirpur 10", device: { fiberLength: 120 } }).expect(200);
    await flushBackground();
    const log = await ActivityLog.findOne({ action: "customer.update" });
    expect(log!.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: "address", to: "Mirpur 10" }), expect.objectContaining({ field: "device.fiberLength", to: 120 })]));

    await api().patch(`/api/v1/packages/${isp.packageId}`).set(isp.auth).send({ vatPercent: 5 }).expect(200);
    const r = await api().post("/api/v1/payments/recharge").set(isp.auth).send({ customer: id, months: 1 });
    expect(r.body.data.payment).toMatchObject({ billAmount: 525, vat: 25, amount: 525 });

    const fee = await api().post("/api/v1/customers/charges").set(isp.auth).send({ customer: id, type: "other", amount: 1500, note: "ONU sale" });
    expect(fee.status).toBe(201);
    expect(fee.body.data.payment).toMatchObject({ type: "other", amount: 1500, months: 0 });
    await api().post("/api/v1/customers/charges").set(isp.auth).send({ customer: id, type: "connection_fee", amount: 500, note: "Installation", addToDue: true }).expect(201);
    expect((await Customer.findById(id))!.dueAmount).toBe(500);

    const tl = await api().get(`/api/v1/customers/${id}/timeline`).set(isp.auth);
    const kinds = tl.body.data.map((e: { kind: string }) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["payment", "change"]));

    const c2 = await createCustomer(isp, { name: "Karim", phone: "01711000002", pppoeUsername: "karim" });
    const bulk = await api().post("/api/v1/customers/bulk").set(isp.auth).send({ zone: isp.zoneId, action: "disable" });
    expect(bulk.body.data).toMatchObject({ total: 2, done: 2 });
    expect(fakeRouter(isp.host).secrets.get("karim")?.disabled).toBe(true);
    expect((await Customer.findById(c2.body.data.customer._id))!.status).toBe("disabled");
  });

  it("changes package now with proration, or at the next recharge", async () => {
    const isp = await setupIsp();
    const c = await createCustomer(isp, { expiryDate: new Date(Date.now() + 20 * DAY) });
    const id = c.body.data.customer._id;
    const big = await api().post("/api/v1/packages").set(isp.auth).send({ name: "20 Mbps", speedDown: 20, speedUp: 20, price: 1000, validityDays: 30, router: isp.routerId, mikrotikProfile: "20M" });
    const pr = await api().post(`/api/v1/customers/${id}/change-package`).set(isp.auth).send({ package: big.body.data._id, mode: "prorate" });
    expect(pr.body.data.mode).toBe("prorate");
    const after = await Customer.findById(id);
    const daysLeft = (after!.expiryDate.getTime() - Date.now()) / DAY;
    expect(daysLeft).toBeGreaterThan(9.5); // 20 days at 500 → 10 days at 1000
    expect(daysLeft).toBeLessThan(10.5);
    expect(after!.monthlyFee).toBe(1000);

    const nx = await api().post(`/api/v1/customers/${id}/change-package`).set(isp.auth).send({ package: isp.packageId, mode: "next" });
    expect(nx.body.data.mode).toBe("next");
    expect((await Customer.findById(id))!.monthlyFee).toBe(1000); // not yet
    const r = await api().post("/api/v1/payments/recharge").set(isp.auth).send({ customer: id, months: 1 });
    expect(r.body.data.payment.billAmount).toBe(500); // switched with this recharge
    expect(fakeRouter(isp.host).secrets.get("rahim")?.profile).toBe("10M");
  });

  it("keeps NID images private", async () => {
    const isp = await setupIsp();
    const c = await createCustomer(isp);
    const id = c.body.data.customer._id;
    const up = await api().post(`/api/v1/customers/${id}/documents/nidFront`).set(isp.auth).attach("file", PNG, { filename: "nid.png", contentType: "image/png" });
    expect(up.status).toBe(200);
    const doc = (await Customer.findById(id))!.documents!.nidFront!;
    expect((await api().get(`/api/v1/customers/${id}/documents/nidFront`)).status).toBe(401);
    const got = await api().get(`/api/v1/customers/${id}/documents/nidFront`).set(isp.auth);
    expect(got.status).toBe(200);
    expect(got.headers["cache-control"]).toContain("no-store");
    expect((await api().get(`/uploads/private/customers/${doc}`)).status).toBe(404); // the public static folder must not serve private files
    fs.rmSync(path.join(config.uploadDir, "private", "customers", doc));
  });
});

describe("tickets: SLA and attachments", () => {
  it("sets a due time from settings, counts overdue and stores attachments privately", async () => {
    const isp = await setupIsp();
    await api().patch("/api/v1/settings").set(isp.auth).send({ ticket: { slaHours: { high: 2 } } }).expect(200);
    const t = await api().post("/api/v1/tickets").set(isp.auth).send({ subject: "Fiber cut at Mirpur", category: "fiber_cut", priority: "high" });
    expect(t.status).toBe(201);
    const hours = (new Date(t.body.data.dueBy).getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(1.9);
    expect(hours).toBeLessThan(2.1);
    await Ticket.updateOne({ _id: t.body.data._id }, { dueBy: new Date(Date.now() - 1000) });
    expect((await api().get("/api/v1/tickets/counts").set(isp.auth)).body.data.overdue).toBe(1);
    expect((await api().get("/api/v1/tickets").query({ status: "overdue" }).set(isp.auth)).body.meta.total).toBe(1);

    const a = await api().post(`/api/v1/tickets/${t.body.data._id}/attachments`).set(isp.auth).attach("file", PNG, { filename: "cut.png", contentType: "image/png" });
    expect(a.status).toBe(201);
    const file = a.body.data[0].file;
    expect((await api().get(`/api/v1/tickets/${t.body.data._id}/attachments/${file}`).set(isp.auth)).status).toBe(200);
    expect((await api().post(`/api/v1/tickets/${t.body.data._id}/attachments`).set(isp.auth).attach("file", Buffer.from("MZ fake exe"), { filename: "x.png", contentType: "image/png" })).status).toBe(400);
    fs.rmSync(path.join(config.uploadDir, "private", "tickets", file));
  });
});

describe("cash book and router sync report", () => {
  it("shows cash in/out with a running balance", async () => {
    const isp = await setupIsp();
    const c = await createCustomer(isp);
    await api().post("/api/v1/payments/recharge").set(isp.auth).send({ customer: c.body.data.customer._id, months: 2 }).expect(201);
    await api().post("/api/v1/payments/recharge").set(isp.auth).send({ customer: c.body.data.customer._id, months: 1, method: "bkash", trxId: "X1" }).expect(201);
    await api().post("/api/v1/accounts/entries").set(isp.auth).send({ type: "expense", category: "Office rent", amount: 300 }).expect(201);
    await api().post("/api/v1/accounts/entries").set(isp.auth).send({ type: "expense", category: "Bandwidth", amount: 100, method: "bank" }).expect(201);
    const cb = await api().get("/api/v1/accounts/cashbook").set(isp.auth);
    expect(cb.body.data).toMatchObject({ opening: 0, totalIn: 1000, totalOut: 300, closing: 700 }); // bKash and bank are not cash
  });

  it("finds DB vs router differences and fixes them", async () => {
    const isp = await setupIsp();
    await createCustomer(isp, { expiryDate: new Date(Date.now() + 10 * DAY) });
    const r = fakeRouter(isp.host);
    r.secrets.get("rahim")!.disabled = true; // someone disabled it on the router
    r.secrets.set("ghost", { name: "ghost", profile: "10M", service: "pppoe", disabled: false });
    const rep = await api().get(`/api/v1/routers/${isp.routerId}/sync-report`).set(isp.auth);
    expect(rep.body.data.summary).toMatchObject({ shouldBeEnabled: 1, onlyOnRouter: 1, missingOnRouter: 0 });
    const fix = await api().post(`/api/v1/routers/${isp.routerId}/sync-fix`).set(isp.auth).send({});
    expect(fix.body.data.fixed).toBe(1);
    expect(r.secrets.get("rahim")!.disabled).toBe(false);
  });
});

describe("platform: error log, refund, email", () => {
  it("groups 5xx errors, records refunds and sends daily summaries", async () => {
    const sa = await admin();
    await recordError(new Error("boom 1"), { method: "GET", path: "/api/v1/x/64b7f0c2a1b2c3d4e5f60718", status: 500 });
    await recordError(new Error("boom 2"), { method: "GET", path: "/api/v1/x/74b7f0c2a1b2c3d4e5f60719", status: 500 });
    expect(await ErrorLog.countDocuments()).toBe(1);
    const logs = await api().get("/api/v1/admin/error-logs").set(sa);
    expect(logs.body.data[0]).toMatchObject({ count: 2, path: "/api/v1/x/:id" });

    const isp = await setupIsp();
    const attempt = await PaymentAttempt.create({ scope: "sms_credit", company: isp.companyId, gateway: "manual", amount: 350, currency: "BDT", description: "1000 SMS", status: "success", refs: { smsCredits: 1000 }, payer: {}, returnPath: "/", tranId: "T-REF-1" });
    await Company.updateOne({ _id: isp.companyId }, { smsBalance: 1200 });
    const ref = await api().post(`/api/v1/admin/payments/${attempt._id}/refund`).set(sa).send({ reason: "Paid twice" });
    expect(ref.status).toBe(200);
    expect((await Company.findById(isp.companyId))!.smsBalance).toBe(200);
    expect((await api().post(`/api/v1/admin/payments/${attempt._id}/refund`).set(sa).send({ reason: "again" })).status).toBe(400);

    await api().patch("/api/v1/admin/settings").set(sa).send({ smtp: { enabled: true, host: "smtp.example.com", port: 587, user: "u", pass: "smtp-secret", from: "ISP Manager <a@b.com>" } }).expect(200);
    const s = await api().get("/api/v1/admin/settings").set(sa);
    expect(s.body.data.smtpHasPassword).toBe(true);
    expect(JSON.stringify(s.body)).not.toContain("smtp-secret");

    const sent: { to: string; subject: string }[] = [];
    setEmailSender(async (m) => void sent.push(m));
    await api().post("/api/v1/admin/settings/test-email").set(sa).send({ to: "me@x.com" }).expect(200);
    const c = await createCustomer(isp);
    await api().post("/api/v1/payments/recharge").set(isp.auth).send({ customer: c.body.data.customer._id, months: 1 }).expect(201);
    expect((await sendDailySummaries()).sent).toBe(1);
    expect(sent.at(-1)!.subject).toContain("৳500 collected");
    await api().patch("/api/v1/settings").set(isp.auth).send({ notifications: { dailySummaryEmail: false } }).expect(200);
    expect((await sendDailySummaries()).sent).toBe(0);
  });
});

describe("marketing content and demo requests", () => {
  it("publishes posts and takes demo requests", async () => {
    const sa = await admin();
    await api().post("/api/v1/admin/content/posts").set(sa).send({ type: "help", title: "How to add a MikroTik router", slug: "add-mikrotik", body: "Step 1: open Routers. Step 2: ...", category: "Getting started", published: true }).expect(201);
    await api().post("/api/v1/admin/content/posts").set(sa).send({ type: "blog", title: "Draft post", slug: "draft-post", body: "Not yet ready to show" }).expect(201);
    expect((await api().get("/api/v1/public/content/posts").query({ type: "help" })).body.meta.total).toBe(1);
    expect((await api().get("/api/v1/public/content/posts")).body.meta.total).toBe(0); // blog draft hidden
    expect((await api().get("/api/v1/public/content/posts/draft-post")).status).toBe(404);
    expect((await api().get("/api/v1/public/content/posts/add-mikrotik")).body.data.title).toContain("MikroTik");

    await api().post("/api/v1/public/content/demo-request").send({ name: "Rafiq", company: "Rafiq Net", phone: "01711223344", customers: 400 }).expect(201);
    const list = await api().get("/api/v1/admin/content/demo-requests").set(sa);
    expect(list.body.data.counts).toEqual({ new: 1 });
  });
});
