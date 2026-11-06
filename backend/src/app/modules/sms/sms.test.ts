import { describe, expect, it } from "vitest";
import { sendExpiryReminders } from "../../jobs/expiryReminder.job";
import { countSegments } from "../../services/sms/segments";
import { flushBackground } from "../../utils/background";
import { fakeSms } from "../../../tests/fakeSms";
import { api } from "../../../tests/helpers";
import { createCustomer, DAY, setupIsp } from "../../../tests/isp";
import { Company } from "../company/company.model";
import { PlatformUser } from "../platformUser/platformUser.model";
import { SmsLog } from "./sms.model";

describe("segment counting", () => {
  it("counts GSM and Bangla (UCS-2) messages", () => {
    expect(countSegments("Hello")).toMatchObject({ encoding: "GSM", segments: 1 });
    expect(countSegments("a".repeat(160)).segments).toBe(1);
    expect(countSegments("a".repeat(161)).segments).toBe(2);
    expect(countSegments("প্রিয় গ্রাহক")).toMatchObject({ encoding: "UNICODE", segments: 1 });
    expect(countSegments("ক".repeat(71)).segments).toBe(2);
    expect(countSegments("{".repeat(80)).length).toBe(160); // extension chars count double
  });
});

describe("automatic SMS", () => {
  it("sends welcome + payment SMS (Bangla templates) and deducts credits", async () => {
    const ctx = await setupIsp();
    const c = await createCustomer(ctx);
    await api().post("/api/v1/payments/recharge").set(ctx.auth).send({ customer: c.body.data.customer._id });
    await flushBackground();

    expect(fakeSms.sent).toHaveLength(2);
    expect(fakeSms.sent[0].message).toContain("ইউজারনেম: rahim");
    expect(fakeSms.sent[1].message).toMatch(/500 টাকা গ্রহণ করা হয়েছে.*R-00001/);
    expect(fakeSms.sent[1].to).toBe("01711000001");

    const company = await Company.findById(ctx.companyId);
    const used = (await SmsLog.find({ company: ctx.companyId })).reduce((n, l) => n + l.segments, 0);
    expect(company!.smsBalance).toBe(50 - used);
  });

  it("respects the per-event switches in settings", async () => {
    const ctx = await setupIsp();
    await api().patch("/api/v1/settings").set(ctx.auth).send({ sms: { autoEvents: { welcome: false } } });
    await createCustomer(ctx);
    await flushBackground();
    expect(fakeSms.sent).toHaveLength(0);
  });

  it("logs a failure and refunds credits when the gateway fails", async () => {
    const ctx = await setupIsp();
    fakeSms.fail = true;
    await createCustomer(ctx);
    await flushBackground();
    const log = await SmsLog.findOne({ company: ctx.companyId });
    expect(log?.status).toBe("failed");
    expect((await Company.findById(ctx.companyId))!.smsBalance).toBe(50);
  });

  it("does not send when the balance is empty", async () => {
    const ctx = await setupIsp();
    await Company.updateOne({ _id: ctx.companyId }, { smsBalance: 0 });
    await createCustomer(ctx);
    await flushBackground();
    expect(fakeSms.sent).toHaveLength(0);
    expect((await SmsLog.findOne({ company: ctx.companyId }))?.error).toBe("Insufficient SMS balance");
  });

  it("sends one expiry reminder per billing period", async () => {
    const ctx = await setupIsp();
    await api().patch("/api/v1/settings").set(ctx.auth).send({ sms: { autoEvents: { welcome: false } } });
    await createCustomer(ctx, { expiryDate: new Date(Date.now() + 2 * DAY) });
    expect((await sendExpiryReminders()).reminded).toBe(1);
    expect((await sendExpiryReminders()).reminded).toBe(0);
    await flushBackground();
    expect(fakeSms.sent).toHaveLength(1);
    expect(fakeSms.sent[0].message).toContain("মেয়াদ");
  });
});

describe("bulk SMS", () => {
  it("sends to customers matching a filter with per-customer variables", async () => {
    const ctx = await setupIsp();
    await api().patch("/api/v1/settings").set(ctx.auth).send({ sms: { autoEvents: { welcome: false } } });
    await createCustomer(ctx, { expiryDate: new Date(Date.now() + 5 * DAY) });
    await createCustomer(ctx, { name: "Karim", phone: "01711000002", pppoeUsername: "karim" }); // expired

    const res = await api()
      .post("/api/v1/sms/send")
      .set(ctx.auth)
      .send({ message: "Dear {name}, please pay {amount} Tk.", target: { type: "filter", status: "expired" } });
    expect(res.status).toBe(202);
    expect(res.body.data.recipients).toBe(1);
    await flushBackground();
    expect(fakeSms.sent).toEqual([{ to: "01711000002", message: "Dear Karim, please pay 500 Tk." }]);
  });

  it("rejects a send that costs more credits than available", async () => {
    const ctx = await setupIsp();
    await Company.updateOne({ _id: ctx.companyId }, { smsBalance: 1 });
    const res = await api()
      .post("/api/v1/sms/send")
      .set(ctx.auth)
      .send({ message: "Hi", target: { type: "numbers", numbers: ["01711000001", "01811000002"] } });
    expect(res.status).toBe(402);
  });

  it("templates can be edited; super admin can add credits", async () => {
    const ctx = await setupIsp();
    const t = await api().get("/api/v1/sms/templates").set(ctx.auth);
    expect(t.body.data.templates).toHaveLength(5);
    const put = await api().put("/api/v1/sms/templates/welcome").set(ctx.auth).send({ message: "Welcome {name}!" });
    expect(put.body.data.message).toBe("Welcome {name}!");

    await PlatformUser.create({ name: "SA", email: "sa@example.com", password: "Admin1234", role: "super_admin" });
    const login = await api().post("/api/v1/auth/admin/login").send({ email: "sa@example.com", password: "Admin1234" });
    const add = await api()
      .post(`/api/v1/admin/companies/${ctx.companyId}/sms-credits`)
      .set({ Authorization: `Bearer ${login.body.data.accessToken}` })
      .send({ credits: 1000, type: "purchase", amount: 350 });
    expect(add.body.data.balance).toBe(1050);
    const bal = await api().get("/api/v1/sms/balance").set(ctx.auth);
    expect(bal.body.data.transactions[0].credits).toBe(1000);

    // tenants cannot call the admin API
    expect((await api().post(`/api/v1/admin/companies/${ctx.companyId}/sms-credits`).set(ctx.auth).send({ credits: 5 })).status).toBe(403);
  });
});
