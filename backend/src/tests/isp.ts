import { expect } from "vitest";
import { api, signupTenant } from "./helpers";

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
export const DAY = 86_400_000;

/** Tenant with a zone, a router (fake host) and a 500৳ package. */
export async function setupIsp(host = "r1.test") {
  const t = await signupTenant();
  const auth = bearer(t.token);
  const zone = await api().post("/api/v1/zones").set(auth).send({ name: "Mirpur" });
  const router = await api().post("/api/v1/routers").set(auth).send({ name: "Core", host, username: "admin", password: "routerpass" });
  const pkg = await api()
    .post("/api/v1/packages")
    .set(auth)
    .send({ name: "10 Mbps", speedDown: 10, speedUp: 10, price: 500, validityDays: 30, router: router.body.data._id, mikrotikProfile: "10M" });
  expect([zone.status, router.status, pkg.status]).toEqual([201, 201, 201]);
  return { ...t, auth, zoneId: zone.body.data._id as string, routerId: router.body.data._id as string, packageId: pkg.body.data._id as string, host };
}

export type Isp = Awaited<ReturnType<typeof setupIsp>>;

export async function createCustomer(ctx: Isp, body: Record<string, unknown> = {}) {
  return api()
    .post("/api/v1/customers")
    .set(ctx.auth)
    .send({ name: "Rahim Uddin", phone: "01711000001", pppoeUsername: "rahim", package: ctx.packageId, zone: ctx.zoneId, ...body });
}

export async function addStaff(ctx: Isp, body: Record<string, unknown>) {
  const res = await api().post("/api/v1/users").set(ctx.auth).send({ name: "Staff", password: "Staff1234", ...body });
  expect(res.status).toBe(201);
  const login = await api().post("/api/v1/auth/login").send({ identifier: body.phone, password: "Staff1234" });
  return { id: res.body.data._id as string, auth: bearer(login.body.data.accessToken) };
}
