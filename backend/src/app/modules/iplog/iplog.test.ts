import { afterEach, describe, expect, it } from "vitest";
import { api } from "../../../tests/helpers";
import { fakeRouter } from "../../../tests/fakeRouter";
import { createCustomer, DAY, setupIsp } from "../../../tests/isp";
import config from "../../config";
import { generateKeyPair } from "../../services/wireguard/wireguard.service";
import { Plan } from "../plan/plan.model";
import { Subscription } from "../subscription/subscription.model";
import { IpSession } from "./iplog.model";
import { parseUptime, pollIpSessions } from "./iplog.service";

async function toPlan(companyId: string, slug: string) {
  const plan = await Plan.findOne({ slug });
  await Subscription.updateOne({ company: companyId }, { plan: plan!._id, status: "active", currentPeriodEnd: new Date(Date.now() + 20 * DAY) });
}

describe("BTRC IP log", () => {
  it("parses RouterOS uptime", () => {
    expect(parseUptime("1w2d3h4m5s")).toBe(((7 + 2) * 24 * 3600 + 3 * 3600 + 4 * 60 + 5) * 1000);
    expect(parseUptime("45s")).toBe(45_000);
    expect(parseUptime(undefined)).toBe(0);
  });

  it("opens, updates and closes sessions from router polls, only for plans with ip_log", async () => {
    const isp = await setupIsp();
    await createCustomer(isp);
    const r = fakeRouter(isp.host);
    r.active.set("rahim", { name: "rahim", address: "10.10.0.5", callerId: "AA:BB:CC:00:00:01", uptime: "10m" });

    const t0 = new Date(Date.now() - 3600_000); // polls happen in the past, so the default "last 24 h" view includes them
    expect((await pollIpSessions(t0)).companies).toBe(0); // trial has no ip_log
    expect((await api().get("/api/v1/ip-logs").set(isp.auth)).status).toBe(403);

    await toPlan(isp.companyId, "pro");
    expect(await pollIpSessions(t0)).toMatchObject({ companies: 1, routers: 1, opened: 1 });
    const s = await IpSession.findOne({ username: "rahim" });
    expect(s!.startedAt.getTime()).toBe(t0.getTime() - 600_000);
    expect(s!.customer).toBeTruthy();

    // same IP → same row; new IP → old closed, new opened; gone → closed
    await pollIpSessions(new Date(t0.getTime() + 300_000));
    expect(await IpSession.countDocuments()).toBe(1);
    r.active.set("rahim", { name: "rahim", address: "10.10.0.9", callerId: "AA:BB:CC:00:00:01", uptime: "1m" });
    expect(await pollIpSessions(new Date(t0.getTime() + 600_000))).toMatchObject({ opened: 1, closed: 1 });
    r.active.clear();
    expect(await pollIpSessions(new Date(t0.getTime() + 900_000))).toMatchObject({ closed: 1 });
    expect(await IpSession.countDocuments({ endedAt: null })).toBe(0);

    const list = await api().get("/api/v1/ip-logs").query({ q: "10.10.0.9" }).set(isp.auth);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].customer.name).toBe("Rahim Uddin");
    const xlsx = await api().get("/api/v1/ip-logs/export").set(isp.auth);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers["content-type"]).toContain("spreadsheetml");
  });
});

describe("WireGuard VPN router mode", () => {
  const saved = { ...config.wireguard };
  afterEach(() => Object.assign(config.wireguard, saved));

  it("generates valid WireGuard keys", () => {
    const k = generateKeyPair();
    expect(Buffer.from(k.publicKey, "base64")).toHaveLength(32);
    expect(Buffer.from(k.privateKey, "base64")).toHaveLength(32);
    expect(k.publicKey).not.toBe(k.privateKey);
  });

  it("gives each router its own tunnel IP and a RouterOS script; refuses when not configured", async () => {
    const isp = await setupIsp();
    expect((await api().post(`/api/v1/routers/${isp.routerId}/vpn`).set(isp.auth)).status).toBe(503);

    Object.assign(config.wireguard, { enabled: true, endpoint: "vpn.example.com:51820", serverPublicKey: generateKeyPair().publicKey, apply: false });
    const res = await api().post(`/api/v1/routers/${isp.routerId}/vpn`).set(isp.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.router).toMatchObject({ connectionMode: "vpn", host: "10.200.0.2" });
    expect(res.body.data.router.vpn.privateKey).toBeUndefined();
    expect(res.body.data.script).toContain("endpoint-address=vpn.example.com endpoint-port=51820");
    expect(res.body.data.script).toContain("/ip address add address=10.200.0.2/16");

    // calling again shows the same tunnel, a second router gets the next IP
    expect((await api().post(`/api/v1/routers/${isp.routerId}/vpn`).set(isp.auth)).body.data.router.host).toBe("10.200.0.2");
    await Plan.updateOne({ slug: "trial" }, { "limits.routers": 5 }); // trial allows 1 router
    const r2 = await api().post("/api/v1/routers").set(isp.auth).send({ name: "Branch", host: "r2.test", username: "admin", password: "x" });
    expect(r2.status).toBe(201);
    expect((await api().post(`/api/v1/routers/${r2.body.data._id}/vpn`).set(isp.auth)).body.data.router.host).toBe("10.200.0.3");

    const off = await api().delete(`/api/v1/routers/${isp.routerId}/vpn`).set(isp.auth).send({ host: "203.0.113.10" });
    expect(off.body.data).toMatchObject({ connectionMode: "public", host: "203.0.113.10" });
  });
});
