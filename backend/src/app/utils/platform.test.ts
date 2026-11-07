import { describe, expect, it } from "vitest";
import { api } from "../../tests/helpers";
import { createCustomer, setupIsp } from "../../tests/isp";
import { MongoRateStore } from "../middlewares/mongoRateStore";
import { Customer } from "../modules/customer/customer.model";

describe("cursor pagination", () => {
  it("walks every row exactly once, even when the sort value ties", async () => {
    const isp = await setupIsp();
    for (let i = 0; i < 7; i++) {
      await createCustomer(isp, { name: `Customer ${i}`, phone: `0171100010${i}`, pppoeUsername: `u${i}` });
    }
    // force ties on the sort field
    await Customer.updateMany({}, { createdAt: new Date("2026-01-01T00:00:00Z") });

    const seen: string[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const r = await api().get("/api/v1/customers").query({ limit: 3, ...(cursor ? { cursor } : {}) }).set(isp.auth);
      expect(r.status).toBe(200);
      expect(r.body.meta.total).toBe(7);
      seen.push(...r.body.data.map((c: { _id: string }) => c._id));
      cursor = r.body.meta.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(7);

    // page mode still works for old clients
    const p2 = await api().get("/api/v1/customers").query({ limit: 3, page: 3 }).set(isp.auth);
    expect(p2.body.data).toHaveLength(1);
    expect((await api().get("/api/v1/customers").query({ cursor: "not-a-cursor" }).set(isp.auth)).status).toBe(400);
  });
});

describe("request hardening", () => {
  it("strips Mongo operators from query and body, and returns a request id", async () => {
    const isp = await setupIsp();
    await createCustomer(isp);
    const r = await api().get("/api/v1/customers").query({ "status[$ne]": "x", "zone[$gt]": "" }).set(isp.auth);
    expect(r.status).toBe(200);
    expect(r.body.meta.total).toBe(1); // operators ignored, not applied
    expect(r.headers["x-request-id"]).toMatch(/^[\w-]{8,}$/);
    const echoed = await api().get("/api/v1/health/live").set("X-Request-Id", "my-trace-12345");
    expect(echoed.headers["x-request-id"]).toBe("my-trace-12345");

    // login with an operator instead of a password must not log in
    const login = await api().post("/api/v1/auth/login").send({ identifier: isp.body.phone, password: { $gt: "" } });
    expect(login.status).toBe(400);
  });

  it("reports liveness and readiness", async () => {
    expect((await api().get("/api/v1/health/live")).status).toBe(200);
    const ready = await api().get("/api/v1/health/ready");
    expect(ready.status).toBe(200);
    expect(ready.body.data.db).toBe("up");
  });

  it("shares rate-limit counters through MongoDB", async () => {
    const a = new MongoRateStore("t");
    const b = new MongoRateStore("t"); // a second API instance
    a.init({ windowMs: 60_000 } as never);
    b.init({ windowMs: 60_000 } as never);
    expect((await a.increment("1.2.3.4")).totalHits).toBe(1);
    expect((await b.increment("1.2.3.4")).totalHits).toBe(2);
    await a.decrement("1.2.3.4");
    expect((await b.increment("1.2.3.4")).totalHits).toBe(2);
    await b.resetKey("1.2.3.4");
    expect((await a.increment("1.2.3.4")).totalHits).toBe(1);
  });
});
