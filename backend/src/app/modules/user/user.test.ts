import { describe, expect, it } from "vitest";
import { api, signupTenant } from "../../../tests/helpers";
import { Company } from "../company/company.model";

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function createStaff(token: string, body: Record<string, unknown>) {
  return api()
    .post("/api/v1/users")
    .set(bearer(token))
    .send({ name: "Staff", password: "Staff1234", ...body });
}

async function loginAs(identifier: string, password = "Staff1234") {
  const res = await api().post("/api/v1/auth/login").send({ identifier, password });
  return res.body.data.accessToken as string;
}

describe("staff management", () => {
  it("owner creates staff; usage counter increments", async () => {
    const t = await signupTenant();
    const res = await createStaff(t.token, { phone: "01900000001", role: "collector" });
    expect(res.status).toBe(201);
    expect(res.body.data.password).toBeUndefined();

    const company = await Company.findById(t.companyId);
    expect(company?.usage.staff).toBe(2);

    const list = await api().get("/api/v1/users?role=collector").set(bearer(t.token));
    expect(list.body.meta.total).toBe(1);
  });

  it("rejects duplicate phone in the same company but allows it in another", async () => {
    const a = await signupTenant();
    const b = await signupTenant();
    expect((await createStaff(a.token, { phone: "01900000002", role: "manager" })).status).toBe(201);
    expect((await createStaff(a.token, { phone: "01900000002", role: "manager" })).status).toBe(409);
    expect((await createStaff(b.token, { phone: "01900000002", role: "manager" })).status).toBe(201);
  });

  it("collector cannot manage staff", async () => {
    const t = await signupTenant();
    await createStaff(t.token, { phone: "01900000003", role: "collector" });
    const collectorToken = await loginAs("01900000003");
    const res = await createStaff(collectorToken, { phone: "01900000004", role: "collector" });
    expect(res.status).toBe(403);
  });

  it("only the owner can create admins", async () => {
    const t = await signupTenant();
    await createStaff(t.token, { phone: "01900000005", role: "admin" });
    const adminToken = await loginAs("01900000005");
    const res = await createStaff(adminToken, { phone: "01900000006", role: "admin" });
    expect(res.status).toBe(403);
    const ok = await createStaff(adminToken, { phone: "01900000007", role: "manager" });
    expect(ok.status).toBe(201);
  });

  it("custom role requires permissions", async () => {
    const t = await signupTenant();
    const res = await createStaff(t.token, { phone: "01900000008", role: "custom" });
    expect(res.status).toBe(400);
  });

  it("deactivated staff can no longer use their token", async () => {
    const t = await signupTenant();
    const created = await createStaff(t.token, { phone: "01900000009", role: "manager" });
    const staffToken = await loginAs("01900000009");
    await api().delete(`/api/v1/users/${created.body.data._id}`).set(bearer(t.token));
    const res = await api().get("/api/v1/users/permissions").set(bearer(staffToken));
    expect(res.status).toBe(401);
  });
});

describe("tenant isolation", () => {
  it("a company cannot read or modify another company's staff", async () => {
    const a = await signupTenant();
    const b = await signupTenant();
    const staff = await createStaff(a.token, { phone: "01900000010", role: "manager" });
    const id = staff.body.data._id;

    expect((await api().get(`/api/v1/users/${id}`).set(bearer(b.token))).status).toBe(404);
    expect((await api().patch(`/api/v1/users/${id}`).set(bearer(b.token)).send({ name: "Hacked" })).status).toBe(404);

    const listB = await api().get("/api/v1/users").set(bearer(b.token));
    expect(listB.body.data.every((u: { company: string }) => u.company === b.companyId)).toBe(true);
  });
});

describe("subscription lapse", () => {
  it("suspended company is read-only", async () => {
    const t = await signupTenant();
    await Company.updateOne({ _id: t.companyId }, { status: "suspended" });

    expect((await api().get("/api/v1/users").set(bearer(t.token))).status).toBe(200);
    const write = await createStaff(t.token, { phone: "01900000011", role: "manager" });
    expect(write.status).toBe(402);
  });

  it("expired trial is read-only", async () => {
    const t = await signupTenant();
    await Company.updateOne({ _id: t.companyId }, { trialEndsAt: new Date(Date.now() - 1000) });
    const write = await createStaff(t.token, { phone: "01900000012", role: "manager" });
    expect(write.status).toBe(402);
  });
});
