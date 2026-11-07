import { describe, expect, it } from "vitest";
import { api, signupTenant } from "../../../tests/helpers";
import { bearer, createCustomer, setupIsp } from "../../../tests/isp";
import { seedPlans } from "../../../scripts/seed";
import { SubscriptionInvoice } from "../billing/billing.model";
import { Company } from "../company/company.model";
import { Customer } from "../customer/customer.model";
import { Plan } from "../plan/plan.model";
import { PlatformUser } from "../platformUser/platformUser.model";
import { Subscription } from "../subscription/subscription.model";
import { JOBS } from "../../jobs";
import { recordJobRun } from "../system/jobRun.model";

async function platformAdmin(role: "super_admin" | "support" | "finance" = "super_admin", email = `${role}@example.com`) {
  await PlatformUser.create({ name: role === "support" ? "Sadia" : "SA", email, password: "Admin12345", role });
  const login = await api().post("/api/v1/auth/admin/login").send({ email, password: "Admin12345" });
  return bearer(login.body.data.accessToken);
}

async function moveToPlan(companyId: string, slug: string) {
  const plan = await Plan.findOne({ slug });
  await Subscription.updateOne({ company: companyId }, { plan: plan!._id, status: "active", currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000) });
  await Company.updateOne({ _id: companyId }, { status: "active" });
}

describe("plan features", () => {
  it("locks tickets and online payment on plans without them", async () => {
    const isp = await signupTenant();
    const auth = bearer(isp.token);
    // Trial includes Growth features
    expect((await api().get("/api/v1/tickets").set(auth)).status).toBe(200);
    expect((await api().get(`/api/v1/public/pay/${isp.body.slug}`)).status).toBe(200);

    await moveToPlan(isp.companyId, "starter");
    const locked = await api().get("/api/v1/tickets").set(auth);
    expect(locked.status).toBe(403);
    expect(locked.body.details).toEqual({ code: "feature_locked", feature: "ticket" });
    expect((await api().get("/api/v1/settings/payment-gateways").set(auth)).status).toBe(403);
    expect((await api().get(`/api/v1/public/pay/${isp.body.slug}`)).status).toBe(404);

    await moveToPlan(isp.companyId, "growth");
    expect((await api().get("/api/v1/tickets").set(auth)).status).toBe(200);
  });

  it("seed never overwrites plans edited by the super admin", async () => {
    await Plan.updateOne({ slug: "starter" }, { $set: { "priceBDT.monthly": 1499, features: ["ticket"] } });
    await seedPlans();
    const starter = await Plan.findOne({ slug: "starter" });
    expect(starter!.priceBDT.monthly).toBe(1499);
    expect(starter!.features).toEqual(["ticket"]);
  });
});

describe("platform roles", () => {
  it("support staff can read but not move money; finance can", async () => {
    const isp = await signupTenant();
    const support = await platformAdmin("support");
    const finance = await platformAdmin("finance");
    expect((await api().get("/api/v1/admin/companies").set(support)).status).toBe(200);
    expect((await api().get(`/api/v1/admin/companies/${isp.companyId}`).set(support)).status).toBe(200);
    expect((await api().post(`/api/v1/admin/companies/${isp.companyId}/sms-credits`).set(support).send({ credits: 100 })).status).toBe(403);
    expect((await api().patch(`/api/v1/admin/companies/${isp.companyId}/status`).set(support).send({ status: "suspended" })).status).toBe(403);
    expect((await api().post(`/api/v1/admin/companies/${isp.companyId}/sms-credits`).set(finance).send({ credits: 100 })).status).toBe(200);
  });
});

describe("platform support tickets", () => {
  it("ISP opens a ticket (even while suspended), platform replies, ISP is notified", async () => {
    const isp = await signupTenant();
    const other = await signupTenant();
    const auth = bearer(isp.token);
    await Company.updateOne({ _id: isp.companyId }, { status: "suspended" });

    const open = await api().post("/api/v1/support").set(auth).send({ subject: "bKash payment not reflected", category: "billing", priority: "urgent", message: "Paid 999 taka, still suspended" });
    expect(open.status).toBe(201);
    const ticketId = open.body.data._id;
    expect(open.body.data.ref).toMatch(/^SUP-[0-9A-F]{8}$/);

    // isolation: another ISP cannot see it
    expect((await api().get(`/api/v1/support/${ticketId}`).set(bearer(other.token))).status).toBe(404);
    expect((await api().get("/api/v1/support").set(bearer(other.token))).body.meta.total).toBe(0);

    const support = await platformAdmin("support");
    const list = await api().get("/api/v1/admin/support-tickets").query({ status: "open" }).set(support);
    expect(list.body.data.counts).toEqual({ open: 1 });
    expect(list.body.data.tickets[0].company.name).toBe(isp.body.companyName);

    const health = await api().get("/api/v1/admin/system/health").set(support);
    expect(health.body.data.support).toMatchObject({ open: 1, urgent: 1 });

    const reply = await api().post(`/api/v1/admin/support-tickets/${ticketId}/reply`).set(support).send({ text: "Approved your payment, please check." });
    expect(reply.status).toBe(201);
    expect(reply.body.data.status).toBe("answered");

    const notes = await api().get("/api/v1/notifications").set(auth);
    expect(notes.body.data.items.some((n: { title: string }) => n.title.includes("bKash payment not reflected"))).toBe(true);

    const thread = await api().get(`/api/v1/support/${ticketId}`).set(auth);
    expect(thread.body.data.messages.map((m: { from: string }) => m.from)).toEqual(["isp", "platform"]);
    expect(thread.body.data.messages[1].name).toContain("Sadia");

    const back = await api().post(`/api/v1/support/${ticketId}/messages`).set(auth).send({ text: "Working now, thanks" });
    expect(back.body.data.status).toBe("open");
    expect((await api().post(`/api/v1/support/${ticketId}/close`).set(auth)).body.data.status).toBe("closed");
  });
});

describe("system health", () => {
  it("reports jobs, database and routers", async () => {
    const sa = await platformAdmin();
    let h = await api().get("/api/v1/admin/system/health").set(sa);
    expect(h.status).toBe(200);
    expect(h.body.data.database).toMatchObject({ ok: true, replicaSet: expect.any(String) });
    expect(h.body.data.jobs.warn).toMatch(/worker/);

    for (const { name } of JOBS) {
      await recordJobRun(name, new Date(), { ok: true, result: { done: 1 } });
    }
    await recordJobRun("retryFailedSyncs", new Date(), { ok: false, error: new Error("router timeout") });
    h = await api().get("/api/v1/admin/system/health").set(sa);
    const retry = h.body.data.jobs.list.find((j: { name: string }) => j.name === "retryFailedSyncs");
    expect(retry).toMatchObject({ runs: 2, failures: 1, lastOk: false, lastError: "router timeout", stale: false });
    expect(h.body.data.jobs.warn).toBe("A job failed on its last run");
  });
});

describe("tenant archive, export and delete", () => {
  it("exports all data without secrets, archives, restores, then deletes permanently", async () => {
    const sa = await platformAdmin();
    const isp = await setupIsp();
    expect((await createCustomer(isp, { pppoePassword: "pppoe-secret" })).status).toBe(201);
    await SubscriptionInvoice.create({ company: isp.companyId, invoiceNo: "INV-T-1", plan: (await Plan.findOne({ slug: "starter" }))!._id, planName: "Starter", interval: "monthly", amount: 999, currency: "BDT", status: "paid", periodStart: new Date(), periodEnd: new Date() });

    // owner self-export
    const own = await api().get("/api/v1/settings/export").set(isp.auth);
    expect(own.status).toBe(200);
    expect(own.headers["content-disposition"]).toContain(`${isp.body.slug}-export-`);
    expect(own.body.company.slug).toBe(isp.body.slug);
    expect(own.body.collections.Customer).toHaveLength(1);
    expect(own.body.collections.MikrotikRouter ?? own.body.collections.Router).toHaveLength(1);
    const raw = JSON.stringify(own.body);
    expect(raw).not.toContain("routerpass");
    expect(raw).not.toMatch(/"password"/);

    // archive → sessions dead, writes and logins blocked
    expect((await api().delete(`/api/v1/admin/companies/${isp.companyId}`).set(sa).send({ confirmSlug: isp.body.slug })).status).toBe(400);
    expect((await api().post(`/api/v1/admin/companies/${isp.companyId}/archive`).set(sa)).status).toBe(200);
    expect((await api().get("/api/v1/customers").set(isp.auth)).status).toBe(403);
    expect((await api().post(`/api/v1/admin/companies/${isp.companyId}/extend-trial`).set(sa).send({ days: 5 })).status).toBe(400);

    // restore (trial still running → trial)
    const restored = await api().post(`/api/v1/admin/companies/${isp.companyId}/restore`).set(sa);
    expect(restored.body.data.status).toBe("trial");

    // admin export works as well
    const exp = await api().get(`/api/v1/admin/companies/${isp.companyId}/export`).set(sa);
    expect(exp.body.collections.Customer).toHaveLength(1);

    await api().post(`/api/v1/admin/companies/${isp.companyId}/archive`).set(sa);
    expect((await api().delete(`/api/v1/admin/companies/${isp.companyId}`).set(sa).send({ confirmSlug: "wrong" })).status).toBe(400);
    const del = await api().delete(`/api/v1/admin/companies/${isp.companyId}`).set(sa).send({ confirmSlug: isp.body.slug });
    expect(del.status).toBe(200);
    expect(del.body.data.removed).toMatchObject({ Customer: 1, User: 1 });

    expect(await Customer.countDocuments({ company: isp.companyId })).toBe(0);
    expect(await SubscriptionInvoice.countDocuments({ company: isp.companyId })).toBe(1); // accounting record kept
    const tomb = await Company.findById(isp.companyId);
    expect(tomb!.deletedAt).toBeInstanceOf(Date);
    expect((await api().get("/api/v1/admin/companies").set(sa)).body.meta.total).toBe(0);
    // slug and phone can be used again
    await signupTenant({ slug: isp.body.slug, phone: isp.body.phone, email: isp.body.email });
  });
});
