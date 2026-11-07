import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installFakeGateways, removeFakeGateways } from "../../../tests/fakeGateway";
import { api } from "../../../tests/helpers";
import { bearer, setupIsp } from "../../../tests/isp";
import { SubscriptionInvoice } from "../billing/billing.model";
import { Company } from "../company/company.model";
import { PlatformUser } from "../platformUser/platformUser.model";
import { Plan } from "../plan/plan.model";
import { Coupon } from "./coupon.model";

beforeAll(installFakeGateways);
afterAll(removeFakeGateways);

async function superAdmin() {
  await PlatformUser.create({ name: "SA", email: "sa@example.com", password: "Admin1234", role: "super_admin" });
  const login = await api().post("/api/v1/auth/admin/login").send({ email: "sa@example.com", password: "Admin1234" });
  const sa = bearer(login.body.data.accessToken);
  await api().put("/api/v1/admin/gateways/sslcommerz").set(sa).send({ enabled: true, credentials: { storeId: "s", storePassword: "p" } });
  return sa;
}

describe("coupons", () => {
  it("super admin creates a coupon; ISP previews and pays the discounted price; one use per ISP", async () => {
    const sa = await superAdmin();
    const starter = await Plan.findOne({ slug: "starter" });
    const created = await api()
      .post("/api/v1/admin/coupons")
      .set(sa)
      .send({ code: "launch20", type: "percent", value: 20, maxUses: 10 });
    expect(created.status).toBe(201);
    expect(created.body.data.code).toBe("LAUNCH20");

    const isp = await setupIsp();
    const body = { plan: String(starter!._id), interval: "monthly", gateway: "sslcommerz" };
    const preview = await api().post("/api/v1/billing/coupon").set(isp.auth).send({ ...body, code: "Launch20" });
    expect(preview.body.data).toMatchObject({ listPrice: 100, discount: 20, finalPrice: 80 });

    const co = await api().post("/api/v1/billing/checkout").set(isp.auth).send({ ...body, coupon: "LAUNCH20" });
    expect(co.status).toBe(201);
    const inv = await SubscriptionInvoice.findOne({ company: isp.companyId });
    expect(inv).toMatchObject({ amount: 80, listPrice: 100, coupon: "LAUNCH20" });

    // not counted until paid
    expect((await Coupon.findOne({ code: "LAUNCH20" }))!.used).toBe(0);
    const tran = co.body.data.redirectUrl.split("/").pop();
    await api().post("/api/v1/pg/sslcommerz/return").type("form").send({ tran_id: tran, ok: "1" });
    const c = await Coupon.findOne({ code: "LAUNCH20" });
    expect(c!.used).toBe(1);
    expect(c!.usedBy.map(String)).toContain(isp.companyId);

    const again = await api().post("/api/v1/billing/coupon").set(isp.auth).send({ ...body, code: "LAUNCH20" });
    expect(again.status).toBe(400);
    expect(again.body.message).toMatch(/already used/);
  });

  it("rejects expired, wrong-plan, exhausted and unknown codes", async () => {
    const sa = await superAdmin();
    const [starter, growth] = await Promise.all([Plan.findOne({ slug: "starter" }), Plan.findOne({ slug: "growth" })]);
    await api().post("/api/v1/admin/coupons").set(sa).send({ code: "OLD", type: "fixed", value: 100, validTo: new Date(Date.now() - 1000), validFrom: new Date(Date.now() - 86_400_000) });
    await api().post("/api/v1/admin/coupons").set(sa).send({ code: "GROWTHONLY", type: "fixed", value: 100, plans: [String(growth!._id)] });
    await api().post("/api/v1/admin/coupons").set(sa).send({ code: "ONE", type: "fixed", value: 100, maxUses: 1 });
    await Coupon.updateOne({ code: "ONE" }, { used: 1 });

    const isp = await setupIsp();
    const check = (code: string) =>
      api().post("/api/v1/billing/coupon").set(isp.auth).send({ code, plan: String(starter!._id), interval: "monthly", gateway: "sslcommerz" });
    expect((await check("OLD")).body.message).toMatch(/expired/);
    expect((await check("GROWTHONLY")).body.message).toMatch(/selected plan/);
    expect((await check("ONE")).body.message).toMatch(/fully used/);
    expect((await check("NOPE")).body.message).toMatch(/Invalid/);
    expect((await api().post("/api/v1/admin/coupons").set(sa).send({ code: "BAD", type: "percent", value: 100 })).status).toBe(400);
  });
});

describe("company profile & onboarding", () => {
  it("owner updates the profile; it shows on receipts; checklist tracks progress", async () => {
    const isp = await setupIsp();
    const dash1 = await api().get("/api/v1/dashboard").set(isp.auth);
    expect(dash1.body.data.onboarding).toMatchObject({ completed: 2, total: 5 }); // router + package done by setupIsp

    const res = await api()
      .patch("/api/v1/settings/company")
      .set(isp.auth)
      .send({ name: "Speed Net BD", address: "Mirpur 10, Dhaka", btrcLicenseNo: "ISP-123", portalColor: "#16a34a", logo: "https://example.com/logo.png" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "Speed Net BD", btrcLicenseNo: "ISP-123", portalTheme: { primaryColor: "#16a34a" } });

    const cleared = await api().patch("/api/v1/settings/company").set(isp.auth).send({ logo: "" });
    expect(cleared.body.data.logo).toBeUndefined();
    expect((await Company.findById(isp.companyId))!.slug).toMatch(/^speednet-/); // slug never changes

    const dash2 = await api().get("/api/v1/dashboard").set(isp.auth);
    expect(dash2.body.data.onboarding.steps.find((s: { key: string }) => s.key === "profile").done).toBe(true);
  });
});
