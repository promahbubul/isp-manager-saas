import dns from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../tests/helpers";
import { fakeSms } from "../../../tests/fakeSms";
import { createCustomer, DAY, setupIsp } from "../../../tests/isp";
import config from "../../config";
import { flushBackground } from "../../utils/background";
import { Company } from "../company/company.model";
import { Plan } from "../plan/plan.model";
import { SmsLog } from "../sms/sms.model";
import { Subscription } from "../subscription/subscription.model";

async function toPlan(companyId: string, slug: string) {
  const plan = await Plan.findOne({ slug });
  await Subscription.updateOne({ company: companyId }, { plan: plan!._id, status: "active", currentPeriodEnd: new Date(Date.now() + 20 * DAY) });
  await Company.updateOne({ _id: companyId }, { status: "active" });
}

afterEach(() => vi.restoreAllMocks());

describe("own SMS gateway", () => {
  it("sends through the ISP's gateway without using credits", async () => {
    const isp = await setupIsp();
    expect((await api().get("/api/v1/settings/sms-gateway").set(isp.auth)).status).toBe(403); // trial: not included
    await toPlan(isp.companyId, "pro");

    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      calls.push(String(url));
      return new Response('{"response_code":202}', { status: 200 });
    });
    const bad = await api().put("/api/v1/settings/sms-gateway").set(isp.auth).send({ enabled: true, httpUrl: "https://gw.example/send?to={to}" });
    expect(bad.status).toBe(400); // needs {message}
    await api()
      .put("/api/v1/settings/sms-gateway")
      .set(isp.auth)
      .send({ enabled: true, httpUrl: "https://gw.example/send?key={apiKey}&to={to}&msg={message}", successPattern: "202", apiKey: "secret-key" })
      .expect(200);
    const got = await api().get("/api/v1/settings/sms-gateway").set(isp.auth);
    expect(got.body.data).toMatchObject({ enabled: true, hasApiKey: true });
    expect(JSON.stringify(got.body)).not.toContain("secret-key");

    const before = (await Company.findById(isp.companyId))!.smsBalance;
    fakeSms.reset();
    await createCustomer(isp); // welcome SMS
    await flushBackground();
    expect(fakeSms.sent).toHaveLength(0); // platform gateway not used
    expect(calls[0]).toContain("key=secret-key&to=8801711000001&msg=");
    expect((await Company.findById(isp.companyId))!.smsBalance).toBe(before);
    expect(await SmsLog.findOne({ ownGateway: true, status: "sent" })).toBeTruthy();
  });
});

describe("public API with API keys", () => {
  it("creates a key once, authenticates, enforces scopes and revocation", async () => {
    const isp = await setupIsp();
    const c = await createCustomer(isp);
    await toPlan(isp.companyId, "enterprise");

    const created = await api().post("/api/v1/settings/api-keys").set(isp.auth).send({ name: "Website", scopes: ["customers:read", "payments:write"] });
    expect(created.status).toBe(201);
    const key = created.body.data.key as string;
    expect(key).toMatch(/^isp_[0-9a-f]{8}_/);
    const list = await api().get("/api/v1/settings/api-keys").set(isp.auth);
    expect(JSON.stringify(list.body)).not.toContain(key);

    const K = { "X-API-Key": key };
    expect((await api().get("/api/v1/public-api/v1/customers")).status).toBe(401);
    expect((await api().get("/api/v1/public-api/v1/customers").set({ "X-API-Key": `${key}x` })).status).toBe(401);
    const customers = await api().get("/api/v1/public-api/v1/customers").set(K);
    expect(customers.body.data).toHaveLength(1);
    const one = await api().get(`/api/v1/public-api/v1/customers/${c.body.data.customer.customerId}`).set(K);
    expect(one.body.data.name ?? one.body.data.customer?.name).toBe("Rahim Uddin");

    const r = await api().post(`/api/v1/public-api/v1/customers/${c.body.data.customer.customerId}/recharge`).set(K).send({ months: 1, method: "bkash", trxId: "TX123" });
    expect(r.status).toBe(201);
    expect(r.body.data.payment.amount).toBe(500);
    expect((await api().get("/api/v1/public-api/v1/payments").set(K)).status).toBe(403); // no payments:read

    await api().delete(`/api/v1/settings/api-keys/${created.body.data._id}`).set(isp.auth).expect(200);
    expect((await api().get("/api/v1/public-api/v1/customers").set(K)).status).toBe(401);
  });
});

describe("custom domain and white label", () => {
  it("verifies the TXT record before the domain resolves to the portal", async () => {
    const isp = await setupIsp();
    await toPlan(isp.companyId, "pro");
    const set = await api().put("/api/v1/settings/custom-domain").set(isp.auth).send({ domain: "My.SpeedNet.com.bd" });
    expect(set.status).toBe(200);
    expect(set.body.data).toMatchObject({ domain: "my.speednet.com.bd", txtName: "_isp-manager.my.speednet.com.bd" });
    expect((await api().get("/api/v1/public/domain/my.speednet.com.bd")).status).toBe(404); // not verified

    vi.spyOn(dns, "resolveTxt").mockResolvedValueOnce([["wrong"]]);
    expect((await api().post("/api/v1/settings/custom-domain/verify").set(isp.auth)).status).toBe(400);
    vi.spyOn(dns, "resolveTxt").mockResolvedValueOnce([[set.body.data.txtValue]]);
    await api().post("/api/v1/settings/custom-domain/verify").set(isp.auth).expect(200);

    const r = await api().get("/api/v1/public/domain/my.speednet.com.bd");
    expect(r.body.data.slug).toBe(isp.body.slug);
    expect((await api().get("/api/v1/public/domain-check").query({ domain: "my.speednet.com.bd" })).status).toBe(200);
    expect((await api().get("/api/v1/public/domain-check").query({ domain: "other.com" })).status).toBe(404);

    // another ISP cannot take it; the platform's own domain is refused
    const other = await setupIsp("o.test");
    await toPlan(other.companyId, "pro");
    expect((await api().put("/api/v1/settings/custom-domain").set(other.auth).send({ domain: "my.speednet.com.bd" })).status).toBe(409);
    expect((await api().put("/api/v1/settings/custom-domain").set(other.auth).send({ domain: `portal.${new URL(config.appUrl).hostname}` })).status).toBe(400);

    expect((await api().get(`/api/v1/portal/isp/${isp.body.slug}`)).body.data.whiteLabel).toBe(false);
    await toPlan(isp.companyId, "enterprise");
    expect((await api().get(`/api/v1/portal/isp/${isp.body.slug}`)).body.data.whiteLabel).toBe(true);
  });
});

describe("analytics", () => {
  it("forecasts collection and flags churn risk", async () => {
    const isp = await setupIsp();
    await createCustomer(isp, { expiryDate: new Date(Date.now() + 10 * DAY) });
    await createCustomer(isp, { name: "Karim", phone: "01711000002", pppoeUsername: "karim", expiryDate: new Date(Date.now() - 12 * DAY), dueAmount: 500 });
    await flushBackground();
    const a = await api().get("/api/v1/analytics").set(isp.auth);
    expect(a.status).toBe(200);
    expect(a.body.data.forecast.next30Days).toMatchObject({ prepaidCustomers: 2, prepaidAmount: 1500, renewalRate: 85, expected: 1275 });
    expect(a.body.data.churn.list[0].customer.name).toBe("Karim");
    expect(a.body.data.churn.list[0].reasons.join(" ")).toContain("expired 12 day(s) ago");
  });
});

describe("WhatsApp notifications", () => {
  it("sends the approved template next to the event SMS", async () => {
    const isp = await setupIsp();
    await toPlan(isp.companyId, "pro");
    const bodies: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200 });
    });
    const bad = await api().put("/api/v1/settings/whatsapp").set(isp.auth).send({ enabled: true, phoneNumberId: "1234567890", accessToken: "EAAB", events: { welcome: { template: "welcome_v1", params: ["salary"] } } });
    expect(bad.status).toBe(400);
    await api()
      .put("/api/v1/settings/whatsapp")
      .set(isp.auth)
      .send({ enabled: true, phoneNumberId: "1234567890", accessToken: "EAAB", events: { welcome: { template: "welcome_v1", language: "bn", params: ["name", "customerId"] } } })
      .expect(200);
    await createCustomer(isp);
    await flushBackground();
    expect(bodies[0]).toMatchObject({
      to: "8801711000001",
      template: { name: "welcome_v1", language: { code: "bn" }, components: [{ type: "body", parameters: [{ text: "Rahim Uddin" }, { text: expect.stringMatching(/^C-/) }] }] },
    });
  });
});

describe("logo upload", () => {
  it("accepts a real PNG and rejects a disguised file", async () => {
    const isp = await setupIsp();
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b60000000049454e44ae426082", "hex");
    const fake = Buffer.from("<svg onload=alert(1)>");
    expect((await api().post("/api/v1/settings/company/logo").set(isp.auth).attach("file", fake, { filename: "x.png", contentType: "image/png" })).status).toBe(400);
    const ok = await api().post("/api/v1/settings/company/logo").set(isp.auth).attach("file", png, { filename: "logo.png", contentType: "image/png" });
    expect(ok.status).toBe(200);
    const url = ok.body.data.logo as string;
    expect(url).toMatch(/\/uploads\/logos\/[0-9a-f]{24}-[0-9a-f]{8}\.png$/);
    const file = path.join(config.uploadDir, "logos", path.basename(url));
    expect(fs.existsSync(file)).toBe(true);
    const served = await api().get(`/uploads/logos/${path.basename(url)}`);
    expect(served.status).toBe(200);
    fs.rmSync(file);
  });
});
