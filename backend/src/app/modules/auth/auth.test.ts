import { describe, expect, it } from "vitest";
import { api, signupTenant } from "../../../tests/helpers";
import { Company } from "../company/company.model";
import { PlatformUser } from "../platformUser/platformUser.model";
import { Subscription } from "../subscription/subscription.model";
import { User } from "../user/user.model";

describe("signup", () => {
  it("creates company, owner and trial subscription", async () => {
    const t = await signupTenant();
    const company = await Company.findById(t.companyId);
    expect(company?.status).toBe("trial");
    expect(company?.trialEndsAt?.getTime()).toBeGreaterThan(Date.now());
    expect(String(company?.owner)).toBe(t.userId);

    const sub = await Subscription.findOne({ company: t.companyId });
    expect(sub?.status).toBe("trialing");

    const owner = await User.findById(t.userId).select("+password");
    expect(owner?.role).toBe("owner");
    expect(owner?.password).not.toBe("Secret123"); // hashed
    expect(t.cookies.some((c) => c.startsWith("rt=") && c.includes("HttpOnly"))).toBe(true);
  });

  it("rejects duplicate and reserved slugs", async () => {
    await signupTenant({ slug: "dupe" });
    const dup = await api().post("/api/v1/auth/signup").send({
      companyName: "Other",
      slug: "dupe",
      ownerName: "Xavier",
      phone: "01811111111",
      email: "x@example.com",
      password: "Secret123",
    });
    expect(dup.status).toBe(409);

    const reserved = await api().post("/api/v1/auth/signup").send({
      companyName: "Other",
      slug: "admin",
      ownerName: "Xavier",
      phone: "01811111112",
      email: "y@example.com",
      password: "Secret123",
    });
    expect(reserved.status).toBe(400);
  });

  it("validates phone and password", async () => {
    const res = await api().post("/api/v1/auth/signup").send({
      companyName: "Bad",
      slug: "bad-co",
      ownerName: "Xavier",
      phone: "12345",
      email: "bad@example.com",
      password: "short",
    });
    expect(res.status).toBe(400);
    const paths = res.body.errors.map((e: { path: string }) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["phone", "password"]));
  });
});

describe("login / refresh / me", () => {
  it("logs in by phone (any BD format) and by email", async () => {
    const t = await signupTenant();
    const byPhone = await api()
      .post("/api/v1/auth/login")
      .send({ identifier: `+88${t.body.phone}`, password: "Secret123" });
    expect(byPhone.status).toBe(200);
    expect(byPhone.body.data.permissions).toContain("subscription.manage");

    const byEmail = await api()
      .post("/api/v1/auth/login")
      .send({ identifier: t.body.email.toUpperCase(), password: "Secret123" });
    expect(byEmail.status).toBe(200);
  });

  it("rejects wrong password", async () => {
    const t = await signupTenant();
    const res = await api().post("/api/v1/auth/login").send({ identifier: t.body.email, password: "Wrong123" });
    expect(res.status).toBe(401);
  });

  it("returns profile with subscription on /me", async () => {
    const t = await signupTenant();
    const res = await api().get("/api/v1/auth/me").set("Authorization", `Bearer ${t.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.subscription.plan.slug).toBe("trial");
  });

  it("refreshes with the cookie and rejects after logout-all", async () => {
    const t = await signupTenant();
    const refreshed = await api().post("/api/v1/auth/refresh-token").set("Cookie", t.cookies);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toBeTruthy();

    await api().post("/api/v1/auth/logout-all").set("Authorization", `Bearer ${t.token}`);
    const after = await api().post("/api/v1/auth/refresh-token").set("Cookie", t.cookies);
    expect(after.status).toBe(401);
  });

  it("requires a token", async () => {
    const res = await api().get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("change password", () => {
  it("changes password and invalidates old sessions", async () => {
    const t = await signupTenant();
    const res = await api()
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ currentPassword: "Secret123", newPassword: "NewSecret456" });
    expect(res.status).toBe(200);

    const oldRefresh = await api().post("/api/v1/auth/refresh-token").set("Cookie", t.cookies);
    expect(oldRefresh.status).toBe(401);

    const login = await api()
      .post("/api/v1/auth/login")
      .send({ identifier: t.body.email, password: "NewSecret456" });
    expect(login.status).toBe(200);
  });
});

describe("platform (super admin) auth", () => {
  it("logs in and cannot use tenant routes", async () => {
    await PlatformUser.create({ name: "SA", email: "sa@example.com", password: "Admin1234", role: "super_admin" });
    const login = await api().post("/api/v1/auth/admin/login").send({ email: "sa@example.com", password: "Admin1234" });
    expect(login.status).toBe(200);
    const token = login.body.data.accessToken;

    const me = await api().get("/api/v1/auth/admin/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);

    const tenantRoute = await api().get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
    expect(tenantRoute.status).toBe(403);
  });
});

describe("public plans", () => {
  it("lists public paid plans without the trial", async () => {
    const res = await api().get("/api/v1/public/plans");
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: { slug: string }) => p.slug);
    expect(slugs).toEqual(["starter", "growth", "pro", "enterprise"]);
  });
});

describe("health", () => {
  it("reports the database status", async () => {
    const res = await api().get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.data.db).toBe("up");
  });
});

describe("session hint cookie and profile photo", () => {
  // 1×1 transparent PNG
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

  it("sets a readable rt_on cookie next to the httpOnly one and clears both on logout", async () => {
    const t = await signupTenant();
    const hint = t.cookies.find((c) => c.startsWith("rt_on="));
    expect(hint).toBeDefined();
    expect(hint).not.toContain("HttpOnly");
    expect(hint).toContain("rt_on=1");

    const out = await api().post("/api/v1/auth/logout").set("Cookie", t.cookies.map((c) => c.split(";")[0]).join("; "));
    const cleared = (out.headers["set-cookie"] as unknown as string[]).map((c) => c.split("=")[0]);
    expect(cleared).toEqual(expect.arrayContaining(["rt", "rt_on"]));
  });

  it("uploads, returns and removes the profile photo", async () => {
    const t = await signupTenant();
    const auth = { Authorization: `Bearer ${t.token}` };

    const bad = await api().post("/api/v1/auth/me/avatar").set(auth).attach("file", Buffer.from("not an image"), "x.png");
    expect(bad.status).toBe(400);

    const up = await api().post("/api/v1/auth/me/avatar").set(auth).attach("file", PNG, "me.png");
    expect(up.status).toBe(200);
    expect(up.body.data.avatar).toMatch(/\/uploads\/avatars\/.+\.png$/);

    const me = await api().get("/api/v1/auth/me").set(auth);
    expect(me.body.data.user.avatar).toBe(up.body.data.avatar);

    const del = await api().delete("/api/v1/auth/me/avatar").set(auth);
    expect(del.status).toBe(200);
    expect((await User.findById(t.userId))?.avatar).toBeUndefined();
  });
});
