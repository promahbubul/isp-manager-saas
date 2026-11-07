import { describe, expect, it } from "vitest";
import { base32Encode, totpAt, verifyTotp } from "../../utils/totp";
import { api } from "../../../tests/helpers";
import { bearer, setupIsp } from "../../../tests/isp";
import { ActivityLog } from "../activityLog/activityLog.model";
import { Company } from "../company/company.model";
import { Plan } from "../plan/plan.model";
import { PlatformUser } from "../platformUser/platformUser.model";
import { Subscription } from "../subscription/subscription.model";
import { PlatformAuditLog } from "./platformAudit";

async function superAdmin(role: "super_admin" | "support" | "finance" = "super_admin", email = "sa@example.com") {
  await PlatformUser.create({ name: "SA", email, password: "Admin12345", role });
  const login = await api().post("/api/v1/auth/admin/login").send({ email, password: "Admin12345" });
  return bearer(login.body.data.accessToken);
}

describe("TOTP", () => {
  it("matches the RFC 6238 SHA-1 test vectors", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    // RFC values are 8 digits; authenticator apps use the last 6.
    expect(totpAt(secret, 59_000)).toBe("287082");
    expect(totpAt(secret, 1_111_111_109_000)).toBe("081804");
    expect(totpAt(secret, 2_000_000_000_000)).toBe("279037");
    expect(verifyTotp(secret, "287082", 59_000 + 25_000)).toBe(true); // one step of drift allowed
    expect(verifyTotp(secret, "287082", 59_000 + 95_000)).toBe(false);
  });
});

describe("platform metrics & tenants", () => {
  it("counts tenants, MRR and lists ISPs with their plan", async () => {
    const sa = await superAdmin();
    const a = await setupIsp("a.test");
    await setupIsp("b.test");
    const starter = await Plan.findOne({ slug: "starter" });
    await Subscription.updateOne({ company: a.companyId }, { plan: starter!._id, status: "active", interval: "monthly", currentPeriodEnd: new Date(Date.now() + 86_400_000 * 20) });

    const m = await api().get("/api/v1/admin/metrics").set(sa);
    expect(m.status).toBe(200);
    expect(m.body.data.tenants).toMatchObject({ total: 2, trial: 2, signups30: 2 });
    expect(m.body.data.mrrBDT).toBe(100);
    expect(m.body.data.paidByPlan).toEqual({ Starter: 1 });

    const list = await api().get("/api/v1/admin/companies").query({ search: "speed" }).set(sa);
    expect(list.body.meta.total).toBe(2);
    const row = list.body.data.find((c: { _id: string }) => c._id === a.companyId);
    expect(row.subscription).toMatchObject({ plan: "Starter", status: "active" });

    const detail = await api().get(`/api/v1/admin/companies/${a.companyId}`).set(sa);
    expect(detail.body.data.owner.phone).toBe(a.body.phone);
    expect(detail.body.data.staff).toBe(1);
  });

  it("suspends/activates, extends trials, assigns plans — and records an audit log", async () => {
    const sa = await superAdmin();
    const isp = await setupIsp();

    await api().patch(`/api/v1/admin/companies/${isp.companyId}/status`).set(sa).send({ status: "suspended", reason: "Abuse report" });
    expect((await api().post("/api/v1/zones").set(isp.auth).send({ name: "X" })).status).toBe(402);
    await api().patch(`/api/v1/admin/companies/${isp.companyId}/status`).set(sa).send({ status: "active" });
    expect((await api().post("/api/v1/zones").set(isp.auth).send({ name: "X" })).status).toBe(201);

    const before = (await Company.findById(isp.companyId))!.trialEndsAt!.getTime();
    await api().post(`/api/v1/admin/companies/${isp.companyId}/extend-trial`).set(sa).send({ days: 7 });
    expect((await Company.findById(isp.companyId))!.trialEndsAt!.getTime()).toBeGreaterThan(before + 6 * 86_400_000);

    const ent = await Plan.findOne({ slug: "enterprise" });
    const until = new Date(Date.now() + 365 * 86_400_000);
    const r = await api()
      .post(`/api/v1/admin/companies/${isp.companyId}/assign-plan`)
      .set(sa)
      .send({ plan: String(ent!._id), interval: "yearly", periodEnd: until, note: "Contract #12" });
    expect(r.status).toBe(200);
    const sub = await Subscription.findOne({ company: isp.companyId });
    expect(sub).toMatchObject({ status: "active", gateway: "manual" });

    await new Promise((res) => setTimeout(res, 50));
    const audit = await api().get("/api/v1/admin/audit-logs").query({ company: isp.companyId }).set(sa);
    const actions = audit.body.data.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["tenant.status", "tenant.extend_trial", "tenant.assign_plan"]));
    expect(audit.body.data.find((l: { action: string }) => l.action === "tenant.assign_plan").summary).toContain("Contract #12");
  });

  it("only super admins change tenants; finance can read", async () => {
    await superAdmin();
    const fin = await superAdmin("finance", "fin@example.com");
    const isp = await setupIsp();
    expect((await api().get("/api/v1/admin/metrics").set(fin)).status).toBe(200);
    expect((await api().patch(`/api/v1/admin/companies/${isp.companyId}/status`).set(fin).send({ status: "suspended" })).status).toBe(403);
    // ISP users cannot reach the admin API at all
    expect((await api().get("/api/v1/admin/companies").set(isp.auth)).status).toBe(403);
  });
});

describe("impersonation", () => {
  it("gives a short tenant session marked as impersonated; sensitive actions are blocked", async () => {
    const sa = await superAdmin();
    const isp = await setupIsp();
    const imp = await api().post(`/api/v1/admin/companies/${isp.companyId}/impersonate`).set(sa);
    expect(imp.status).toBe(200);
    const cookie = (imp.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("rt="))!;
    expect(cookie).toMatch(/Max-Age=3600/);

    // the browser refreshes with that cookie and keeps the impersonation flag
    const refreshed = await api().post("/api/v1/auth/refresh-token").set("Cookie", [cookie]);
    const token = refreshed.body.data.accessToken;
    const me = await api().get("/api/v1/auth/me").set(bearer(token));
    expect(me.body.data.impersonation).toEqual({ by: "SA" });
    expect(me.body.data.user.role).toBe("owner");

    expect((await api().post("/api/v1/auth/change-password").set(bearer(token)).send({ currentPassword: "Secret123", newPassword: "Other1234" })).status).toBe(403);

    await api().post("/api/v1/zones").set(bearer(token)).send({ name: "Support zone" });
    await new Promise((res) => setTimeout(res, 50));
    const log = await ActivityLog.findOne({ action: "zone.create" }).sort("-createdAt");
    expect(log!.summary).toMatch(/^\[by platform admin\]/);
    expect(await PlatformAuditLog.exists({ action: "tenant.impersonate", company: isp.companyId })).toBeTruthy();

    // a normal login is unaffected
    const normal = await api().get("/api/v1/auth/me").set(isp.auth);
    expect(normal.body.data.impersonation).toBeNull();
  });
});

describe("plans & announcements", () => {
  it("creates/edits plans and targets announcements by plan", async () => {
    const sa = await superAdmin();
    const created = await api()
      .post("/api/v1/admin/plans")
      .set(sa)
      .send({
        name: "Mini",
        slug: "mini",
        priceBDT: { monthly: 499, yearly: 4990 },
        priceUSD: { monthly: 5, yearly: 50 },
        limits: { customers: 100, routers: 1, staff: 2 },
        sortOrder: 0,
      });
    expect(created.status).toBe(201);
    const upd = await api().patch(`/api/v1/admin/plans/${created.body.data._id}`).set(sa).send({ priceBDT: { monthly: 599, yearly: 5990 } });
    expect(upd.body.data.priceBDT.monthly).toBe(599);
    const pub = await api().get("/api/v1/public/plans");
    expect(pub.body.data[0].slug).toBe("mini");
    expect(upd.body.data.sortOrder).toBe(0); // PATCH must not reset other fields to defaults

    const isp = await setupIsp();
    const growth = await Plan.findOne({ slug: "growth" });
    await api().post("/api/v1/admin/announcements").set(sa).send({ title: "Maintenance tonight 2am", type: "warning" });
    await api().post("/api/v1/admin/announcements").set(sa).send({ title: "Growth-only feature", plans: [String(growth!._id)] });
    const seen = await api().get("/api/v1/announcements").set(isp.auth);
    expect(seen.body.data.map((a: { title: string }) => a.title)).toEqual(["Maintenance tonight 2am"]);
  });
});

describe("platform staff & 2FA", () => {
  it("super admin adds staff; 2FA setup → login needs the code → disable", async () => {
    const sa = await superAdmin();
    const add = await api().post("/api/v1/admin/platform-users").set(sa).send({ name: "Support", email: "sup@example.com", role: "support", password: "Support12345" });
    expect(add.status).toBe(201);

    const setup = await api().post("/api/v1/auth/admin/2fa/setup").set(sa);
    const secret = setup.body.data.secret;
    expect(setup.body.data.otpauthUrl).toContain("otpauth://totp/");
    expect((await api().post("/api/v1/auth/admin/2fa/enable").set(sa).send({ code: "000000" })).status).toBe(400);
    expect((await api().post("/api/v1/auth/admin/2fa/enable").set(sa).send({ code: totpAt(secret, Date.now()) })).status).toBe(200);

    const noCode = await api().post("/api/v1/auth/admin/login").send({ email: "sa@example.com", password: "Admin12345" });
    expect(noCode.status).toBe(401);
    expect(noCode.body.details.needs2fa).toBe(true);
    const withCode = await api().post("/api/v1/auth/admin/login").send({ email: "sa@example.com", password: "Admin12345", totp: totpAt(secret, Date.now()) });
    expect(withCode.status).toBe(200);
    const me = await api().get("/api/v1/auth/admin/me").set(bearer(withCode.body.data.accessToken));
    expect(me.body.data.twoFactor).toEqual({ enabled: true }); // secret never returned

    const off = await api()
      .post("/api/v1/auth/admin/2fa/disable")
      .set(bearer(withCode.body.data.accessToken))
      .send({ password: "Admin12345", code: totpAt(secret, Date.now()) });
    expect(off.status).toBe(200);
    expect((await api().post("/api/v1/auth/admin/login").send({ email: "sa@example.com", password: "Admin12345" })).status).toBe(200);
  });
});
