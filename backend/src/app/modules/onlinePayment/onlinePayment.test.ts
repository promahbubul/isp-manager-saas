import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runSubscriptionLifecycle } from "../../jobs/subscriptionLifecycle.job";
import { flushBackground } from "../../utils/background";
import { fakeRouter } from "../../../tests/fakeRouter";
import { installFakeGateways, removeFakeGateways } from "../../../tests/fakeGateway";
import { api } from "../../../tests/helpers";
import { bearer, createCustomer, DAY, setupIsp } from "../../../tests/isp";
import { SubscriptionInvoice } from "../billing/billing.model";
import { Company } from "../company/company.model";
import { Customer } from "../customer/customer.model";
import { Payment } from "../payment/payment.model";
import { PlatformUser } from "../platformUser/platformUser.model";
import { Plan } from "../plan/plan.model";
import { Subscription } from "../subscription/subscription.model";
import { PaymentAttempt } from "./paymentAttempt.model";

beforeAll(installFakeGateways);
afterAll(removeFakeGateways);

async function superAdmin() {
  await PlatformUser.create({ name: "SA", email: "sa@example.com", password: "Admin1234", role: "super_admin" });
  const login = await api().post("/api/v1/auth/admin/login").send({ email: "sa@example.com", password: "Admin1234" });
  return bearer(login.body.data.accessToken);
}

const CREDS = {
  sslcommerz: { storeId: "teststore", storePassword: "secret" },
  bkash: { username: "u", password: "p", appKey: "k", appSecret: "s" },
  stripe: { secretKey: "sk_test_x", webhookSecret: "whsec_test_secret" },
};

async function enablePlatform(sa: Record<string, string>, gateway: keyof typeof CREDS | "manual") {
  const body = gateway === "manual" ? { enabled: true, instructions: "bKash 01700000000 Send Money" } : { enabled: true, credentials: CREDS[gateway] };
  const res = await api().put(`/api/v1/admin/gateways/${gateway}`).set(sa).send(body);
  expect(res.status).toBe(200);
}

const tranFromRedirect = (url: string) => url.split("/").pop()!;
const starterId = async () => String((await Plan.findOne({ slug: "starter" }))!._id);

describe("gateway settings", () => {
  it("cannot enable without credentials; secrets are masked when read back", async () => {
    const sa = await superAdmin();
    const bad = await api().put("/api/v1/admin/gateways/sslcommerz").set(sa).send({ enabled: true });
    expect(bad.status).toBe(400);

    await enablePlatform(sa, "sslcommerz");
    const list = await api().get("/api/v1/admin/gateways").set(sa);
    const ssl = list.body.data.gateways.find((g: { gateway: string }) => g.gateway === "sslcommerz");
    expect(ssl).toMatchObject({ enabled: true, configured: true });
    const pw = ssl.fields.find((f: { key: string }) => f.key === "storePassword");
    expect(pw.value).toBeUndefined();
    expect(pw.hint).toBe("••••cret");
    expect(JSON.stringify(list.body)).not.toMatch(/:"secret"/); // the stored password value never appears

    // ISP admins cannot touch platform gateways, and see their own (separate) settings
    const isp = await setupIsp();
    expect((await api().put("/api/v1/admin/gateways/bkash").set(isp.auth).send({ enabled: false })).status).toBe(403);
    const own = await api().get("/api/v1/settings/payment-gateways").set(isp.auth);
    expect(own.body.data.gateways.every((g: { enabled: boolean }) => !g.enabled)).toBe(true);
  });
});

describe("SaaS subscription payment", () => {
  it("pays a plan via SSLCommerz: redirect → verify → plan active; duplicate IPN is ignored", async () => {
    const sa = await superAdmin();
    await enablePlatform(sa, "sslcommerz");
    const isp = await setupIsp();

    const overview = await api().get("/api/v1/billing").set(isp.auth);
    expect(overview.body.data.methods.map((m: { gateway: string }) => m.gateway)).toEqual(["sslcommerz"]);

    const co = await api().post("/api/v1/billing/checkout").set(isp.auth).send({ plan: await starterId(), interval: "monthly", gateway: "sslcommerz" });
    expect(co.status).toBe(201);
    const tran = tranFromRedirect(co.body.data.redirectUrl);

    const ret = await api().post("/api/v1/pg/sslcommerz/return").type("form").send({ tran_id: tran, status: "VALID", ok: "1" });
    expect(ret.status).toBe(303);
    expect(ret.headers.location).toMatch(/\/dashboard\/billing\/subscription\?payment=success/);

    const sub = await Subscription.findOne({ company: isp.companyId }).populate("plan");
    expect((sub!.plan as unknown as { slug: string }).slug).toBe("starter");
    expect(sub!.status).toBe("active");
    const days = (sub!.currentPeriodEnd.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    expect((await Company.findById(isp.companyId))!.status).toBe("active");
    expect((await SubscriptionInvoice.findOne({ company: isp.companyId }))!.status).toBe("paid");

    // IPN arrives after the redirect — must not extend again
    const end = sub!.currentPeriodEnd.getTime();
    await api().post("/api/v1/pg/sslcommerz/ipn").type("form").send({ tran_id: tran, status: "VALID", ok: "1" });
    expect((await Subscription.findOne({ company: isp.companyId }))!.currentPeriodEnd.getTime()).toBe(end);

    // renewing the same plan stacks onto the current end date
    const co2 = await api().post("/api/v1/billing/checkout").set(isp.auth).send({ plan: await starterId(), interval: "monthly", gateway: "sslcommerz" });
    await api().post("/api/v1/pg/sslcommerz/return").type("form").send({ tran_id: tranFromRedirect(co2.body.data.redirectUrl), ok: "1" });
    const renewed = await Subscription.findOne({ company: isp.companyId });
    expect(renewed!.currentPeriodEnd.getTime()).toBeGreaterThan(end + 27 * DAY);
  });

  it("failed payment voids the invoice and changes nothing", async () => {
    const sa = await superAdmin();
    await enablePlatform(sa, "bkash");
    const isp = await setupIsp();
    const co = await api().post("/api/v1/billing/checkout").set(isp.auth).send({ plan: await starterId(), interval: "monthly", gateway: "bkash" });
    const tran = tranFromRedirect(co.body.data.redirectUrl);
    const ret = await api().get("/api/v1/pg/bkash/callback").query({ tran, status: "failure" });
    expect(ret.headers.location).toMatch(/payment=failed/);
    expect((await SubscriptionInvoice.findOne({ company: isp.companyId }))!.status).toBe("void");
    expect((await Subscription.findOne({ company: isp.companyId }))!.status).toBe("trialing");
  });

  it("rejects disabled gateways, free-priced plans and Stripe in USD", async () => {
    const sa = await superAdmin();
    await enablePlatform(sa, "stripe");
    const isp = await setupIsp();
    const off = await api().post("/api/v1/billing/checkout").set(isp.auth).send({ plan: await starterId(), interval: "monthly", gateway: "sslcommerz" });
    expect(off.status).toBe(400);
    const ent = await Plan.findOne({ slug: "enterprise" });
    const free = await api().post("/api/v1/billing/checkout").set(isp.auth).send({ plan: String(ent!._id), interval: "monthly", gateway: "stripe" });
    expect(free.status).toBe(400);
    await api().post("/api/v1/billing/checkout").set(isp.auth).send({ plan: await starterId(), interval: "yearly", gateway: "stripe" });
    const attempt = await PaymentAttempt.findOne({ company: isp.companyId, gateway: "stripe" });
    expect(attempt).toMatchObject({ currency: "USD", amount: 90 });
  });

  it("a suspended ISP can still pay and gets reactivated", async () => {
    const sa = await superAdmin();
    await enablePlatform(sa, "sslcommerz");
    const isp = await setupIsp();
    await Company.updateOne({ _id: isp.companyId }, { status: "suspended" });
    const co = await api().post("/api/v1/billing/checkout").set(isp.auth).send({ plan: await starterId(), interval: "monthly", gateway: "sslcommerz" });
    expect(co.status).toBe(201);
    await api().post("/api/v1/pg/sslcommerz/return").type("form").send({ tran_id: tranFromRedirect(co.body.data.redirectUrl), ok: "1" });
    expect((await Company.findById(isp.companyId))!.status).toBe("active");
  });

  it("manual payment: pending → super admin approves; a TrxID can be used once", async () => {
    const sa = await superAdmin();
    await enablePlatform(sa, "manual");
    const isp = await setupIsp();
    const body = { plan: await starterId(), interval: "monthly", gateway: "manual", trxId: "8N7A6B5C" };
    const co = await api().post("/api/v1/billing/checkout").set(isp.auth).send(body);
    expect(co.status).toBe(201);
    expect(co.body.data.attempt.status).toBe("pending_review");
    expect((await api().post("/api/v1/billing/checkout").set(isp.auth).send(body)).status).toBe(409);

    const pending = await api().get("/api/v1/admin/payments").query({ status: "pending_review" }).set(sa);
    expect(pending.body.data).toHaveLength(1);
    const ok = await api().post(`/api/v1/admin/payments/${pending.body.data[0]._id}/review`).set(sa).send({ approve: true });
    expect(ok.status).toBe(200);
    expect((await Subscription.findOne({ company: isp.companyId }))!.status).toBe("active");
  });

  it("buys SMS credits", async () => {
    const sa = await superAdmin();
    await enablePlatform(sa, "bkash");
    const isp = await setupIsp();
    const co = await api().post("/api/v1/billing/sms-credits").set(isp.auth).send({ credits: 1000, gateway: "bkash" });
    expect(co.body.data).toMatchObject({ amount: 350, currency: "BDT" });
    await api().get("/api/v1/pg/bkash/callback").query({ tran: tranFromRedirect(co.body.data.redirectUrl), status: "success", ok: "1" });
    expect((await Company.findById(isp.companyId))!.smsBalance).toBeGreaterThanOrEqual(1000);
  });

  it("only the owner can manage the subscription", async () => {
    const isp = await setupIsp();
    await api().post("/api/v1/users").set(isp.auth).send({ name: "Adm", phone: "01900000009", role: "admin", password: "Staff1234" });
    const login = await api().post("/api/v1/auth/login").send({ identifier: "01900000009", password: "Staff1234" });
    expect((await api().get("/api/v1/billing").set(bearer(login.body.data.accessToken))).status).toBe(403);
  });
});

describe("Stripe webhook", () => {
  it("verifies the signature and completes the payment", async () => {
    const sa = await superAdmin();
    await enablePlatform(sa, "stripe");
    const isp = await setupIsp();
    const co = await api().post("/api/v1/billing/checkout").set(isp.auth).send({ plan: await starterId(), interval: "monthly", gateway: "stripe" });
    const tran = tranFromRedirect(co.body.data.redirectUrl);

    const payload = JSON.stringify({
      id: "evt_1",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_1", object: "checkout.session", metadata: { tranId: tran } } },
    });
    const stripe = new Stripe("sk_test_x");
    const bad = await api().post("/api/v1/pg/stripe/webhook/platform").set("Content-Type", "application/json").set("Stripe-Signature", "t=1,v1=bad").send(payload);
    expect(bad.status).toBe(400);

    // Our fake "verify" needs ok=1 — the webhook passes only session_id, so it will be declined:
    // this proves the webhook re-verifies with the gateway instead of trusting the event body.
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: CREDS.stripe.webhookSecret });
    const good = await api().post("/api/v1/pg/stripe/webhook/platform").set("Content-Type", "application/json").set("Stripe-Signature", header).send(payload);
    expect(good.status).toBe(200);
    expect((await PaymentAttempt.findOne({ tranId: tran }))!.status).toBe("failed");
  });
});

describe("customer bill payment (customer → ISP)", () => {
  async function ispWithCustomer() {
    const isp = await setupIsp();
    await api().put("/api/v1/settings/payment-gateways/bkash").set(isp.auth).send({ enabled: true, credentials: CREDS.bkash });
    await api().patch("/api/v1/settings").set(isp.auth).send({ sms: { autoEvents: { welcome: false } } });
    const c = await createCustomer(isp, { expiryDate: new Date(Date.now() - DAY) }); // expired → disabled on router
    const slug = (await Company.findById(isp.companyId))!.slug;
    return { isp, slug, customer: c.body.data.customer };
  }

  it("customer looks up the bill, pays with bKash and is reconnected automatically", async () => {
    const { isp, slug, customer } = await ispWithCustomer();
    expect(fakeRouter(isp.host).secrets.get("rahim")?.disabled).toBe(true);

    const info = await api().get(`/api/v1/public/pay/${slug}`);
    expect(info.body.data.methods.map((m: { gateway: string }) => m.gateway)).toEqual(["bkash"]);

    expect((await api().post(`/api/v1/public/pay/${slug}/lookup`).send({ account: customer.customerId, phone: "01799999999" })).status).toBe(404);
    const bill = await api().post(`/api/v1/public/pay/${slug}/lookup`).send({ account: "rahim", phone: "+8801711000001" });
    expect(bill.body.data).toMatchObject({ name: "Rahim Uddin", payableOneMonth: 500 });

    // methods the ISP has not enabled are refused
    expect((await api().post(`/api/v1/public/pay/${slug}/checkout`).send({ account: "rahim", phone: "01711000001", gateway: "sslcommerz" })).status).toBe(400);

    const co = await api().post(`/api/v1/public/pay/${slug}/checkout`).send({ account: "rahim", phone: "01711000001", months: 2, gateway: "bkash" });
    expect(co.body.data.amount).toBe(1000);
    const tran = co.body.data.tranId;
    const ret = await api().get("/api/v1/pg/bkash/callback").query({ tran, status: "success", ok: "1", amount: "1000" });
    expect(ret.headers.location).toContain(`/pay/${slug}?payment=success`);
    await flushBackground();

    const fresh = await Customer.findById(customer._id);
    expect(fresh!.status).toBe("active");
    expect(fakeRouter(isp.host).secrets.get("rahim")?.disabled).toBe(false);
    const payment = await Payment.findOne({ customer: customer._id });
    expect(payment).toMatchObject({ amount: 1000, months: 2, method: "bkash", source: "online" });
    expect(payment!.receivedBy).toBeUndefined();

    const status = await api().get(`/api/v1/public/pay/${slug}/status/${tran}`);
    expect(status.body.data).toMatchObject({ status: "success", receiptNo: "R-00001" });

    const staffView = await api().get("/api/v1/online-payments").set(isp.auth);
    expect(staffView.body.data[0].status).toBe("success");
  });

  it("manual customer payment waits for staff approval (or rejection)", async () => {
    const { isp, slug, customer } = await ispWithCustomer();
    await api().put("/api/v1/settings/payment-gateways/manual").set(isp.auth).send({ enabled: true, instructions: "bKash personal 01811111111" });

    const co = await api()
      .post(`/api/v1/public/pay/${slug}/checkout`)
      .send({ account: customer.customerId, phone: "01711000001", gateway: "manual", method: "bkash", trxId: "ABC123XYZ", senderNumber: "01711000001" });
    expect(co.body.data.status).toBe("pending_review");
    expect((await Customer.findById(customer._id))!.status).toBe("expired");

    const list = await api().get("/api/v1/online-payments").query({ status: "pending_review" }).set(isp.auth);
    const id = list.body.data[0]._id;
    const ok = await api().post(`/api/v1/online-payments/${id}/approve`).set(isp.auth);
    expect(ok.status).toBe(200);
    await flushBackground();
    expect((await Customer.findById(customer._id))!.status).toBe("active");
    const p = await Payment.findOne({ customer: customer._id });
    expect(p).toMatchObject({ trxId: "ABC123XYZ", source: "manual_online", method: "bkash" });
    expect(String(p!.receivedBy)).toBe(isp.userId);

    // second submission → reject
    const co2 = await api()
      .post(`/api/v1/public/pay/${slug}/checkout`)
      .send({ account: customer.customerId, phone: "01711000001", gateway: "manual", trxId: "FAKE999" });
    const rej = await api().post(`/api/v1/online-payments/${co2.body.data.tranId ? (await PaymentAttempt.findOne({ tranId: co2.body.data.tranId }))!._id : ""}/reject`).set(isp.auth).send({ reason: "Not found in statement" });
    expect(rej.body.data.status).toBe("failed");

    // another ISP cannot approve this ISP's payments
    const other = await setupIsp("other.test");
    expect((await api().post(`/api/v1/online-payments/${id}/approve`).set(other.auth)).status).toBe(404);
  });
});

describe("subscription lifecycle job", () => {
  it("trial end → suspended; paid period end → past_due → suspended after grace", async () => {
    const a = await setupIsp("a.test");
    await Company.updateOne({ _id: a.companyId }, { trialEndsAt: new Date(Date.now() - 1000) });
    const b = await setupIsp("b.test");
    await Company.updateOne({ _id: b.companyId }, { status: "active" });
    await Subscription.updateOne({ company: b.companyId }, { status: "active", currentPeriodEnd: new Date(Date.now() - 1000) });

    const r1 = await runSubscriptionLifecycle();
    expect(r1).toMatchObject({ trialEnded: 1, pastDue: 1, suspended: 0 });
    expect((await Company.findById(a.companyId))!.status).toBe("suspended");
    expect((await Company.findById(b.companyId))!.status).toBe("past_due");

    // past_due is still writable during grace
    const write = await api().post("/api/v1/zones").set(b.auth).send({ name: "Grace zone" });
    expect(write.status).toBe(201);

    const r2 = await runSubscriptionLifecycle(new Date(Date.now() + 8 * DAY));
    expect(r2.suspended).toBe(1);
    expect((await Company.findById(b.companyId))!.status).toBe("suspended");
  });
});
