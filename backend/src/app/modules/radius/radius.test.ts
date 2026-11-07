import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "../../../tests/helpers";
import { fakeRouter } from "../../../tests/fakeRouter";
import { createCustomer, DAY, setupIsp } from "../../../tests/isp";
import config from "../../config";
import { Customer } from "../customer/customer.model";
import { IpSession } from "../iplog/iplog.model";

const SECRET = "test-radius-secret-0123456789";
const R = "/api/v1/radius";
const H = { "X-Radius-Secret": SECRET };
/** rlm_rest "json" body format */
const rad = (attrs: Record<string, string | number>) => Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, { type: "string", value: [String(v)] }]));

describe("RADIUS (FreeRADIUS rlm_rest)", () => {
  const saved = { ...config.radius };
  let clients = "";
  beforeEach(() => {
    clients = path.join(os.tmpdir(), `radius-clients-${Date.now()}`);
    Object.assign(config.radius, { apiSecret: SECRET, host: "radius.example.com", clientsFile: clients });
  });
  afterEach(() => {
    Object.assign(config.radius, saved);
    fs.rmSync(clients, { force: true });
  });

  it("authorizes active customers with their password and speed, rejects expired ones", async () => {
    const isp = await setupIsp("203.0.113.5");
    const c = await createCustomer(isp, { pppoePassword: "pass1234", expiryDate: new Date(Date.now() + 10 * DAY) });
    const setup = await api().post(`/api/v1/routers/${isp.routerId}/radius`).set(isp.auth);
    expect(setup.status).toBe(200);
    expect(setup.body.data.script).toContain("/radius add service=ppp address=radius.example.com");
    expect(setup.body.data.router.radius?.secret).toBeUndefined();
    expect(fs.readFileSync(clients, "utf8")).toContain("ipaddr = 203.0.113.5");

    expect((await api().post(`${R}/authorize`).send(rad({ "User-Name": "rahim", "NAS-IP-Address": "203.0.113.5" }))).status).toBe(401); // no secret
    const ok = await api().post(`${R}/authorize`).set(H).send(rad({ "User-Name": "rahim", "NAS-IP-Address": "203.0.113.5" }));
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ "control:Cleartext-Password": "pass1234", "reply:Mikrotik-Rate-Limit": "10M/10M" });
    // HTTP basic auth (what FreeRADIUS 3 sends) works too
    const basic = await api().post(`${R}/authorize`).auth("freeradius", SECRET).send(rad({ "User-Name": "rahim", "NAS-IP-Address": "203.0.113.5" }));
    expect(basic.status).toBe(200);
    expect((await api().post(`${R}/authorize`).set(H).send(rad({ "User-Name": "nobody", "NAS-IP-Address": "203.0.113.5" }))).status).toBe(404);
    expect((await api().post(`${R}/authorize`).set(H).send(rad({ "User-Name": "rahim", "NAS-IP-Address": "198.51.100.9" }))).status).toBe(404); // unknown router

    await Customer.updateOne({ _id: c.body.data.customer._id }, { status: "expired" });
    const no = await api().post(`${R}/authorize`).set(H).send(rad({ "User-Name": "rahim", "NAS-IP-Address": "203.0.113.5" }));
    expect(no.status).toBe(401);
    expect(no.body["reply:Reply-Message"]).toContain("expired");

    // walled garden for expired customers
    await api().patch(`/api/v1/routers/${isp.routerId}`).set(isp.auth).send({ radius: { expiredPool: "expired-pool" } }).expect(200);
    expect(fs.readFileSync(clients, "utf8")).toMatch(/secret = \S{20,}/); // editing the router kept its RADIUS secret
    const wg = await api().post(`${R}/authorize`).set(H).send(rad({ "User-Name": "rahim", "NAS-IP-Address": "203.0.113.5" }));
    expect(wg.body).toMatchObject({ "reply:Framed-Pool": "expired-pool", "reply:Mikrotik-Rate-Limit": "512k/512k" });
  });

  it("does not write secrets to a RADIUS router, but kicks on disable", async () => {
    const isp = await setupIsp("203.0.113.6");
    await api().post(`/api/v1/routers/${isp.routerId}/radius`).set(isp.auth).expect(200);
    const r = fakeRouter(isp.host);
    const c = await createCustomer(isp, { pppoeUsername: "karim", phone: "01711000002" });
    expect(c.body.data.customer.syncStatus).toBe("synced");
    expect(r.secrets.has("karim")).toBe(false);
    r.active.set("karim", { name: "karim", address: "10.0.0.9" });
    await api().patch(`/api/v1/customers/${c.body.data.customer._id}/disable`).set(isp.auth).expect(200);
    expect(r.active.has("karim")).toBe(false);
  });

  it("records accounting into the BTRC IP log", async () => {
    const isp = await setupIsp("203.0.113.7");
    await createCustomer(isp);
    await api().post(`/api/v1/routers/${isp.routerId}/radius`).set(isp.auth).expect(200);
    const base = { "User-Name": "rahim", "NAS-IP-Address": "203.0.113.7", "Acct-Session-Id": "81a00001", "Framed-IP-Address": "10.10.0.5", "Calling-Station-Id": "AA:BB:CC:00:00:01" };
    await api().post(`${R}/accounting`).set(H).send(rad({ ...base, "Acct-Status-Type": "Start" })).expect(204);
    await api().post(`${R}/accounting`).set(H).send(rad({ ...base, "Acct-Status-Type": "Interim-Update", "Acct-Input-Octets": 1000, "Acct-Output-Gigawords": 1, "Acct-Output-Octets": 5 })).expect(204);
    let s = await IpSession.findOne({ acctSessionId: "81a00001" });
    expect(s).toMatchObject({ username: "rahim", ip: "10.10.0.5", mac: "AA:BB:CC:00:00:01", bytesIn: 1000, bytesOut: 2 ** 32 + 5, endedAt: null });
    expect(s!.customer).toBeTruthy();
    await api().post(`${R}/accounting`).set(H).send(rad({ ...base, "Acct-Status-Type": "Stop" })).expect(204);
    s = await IpSession.findOne({ acctSessionId: "81a00001" });
    expect(s!.endedAt).toBeInstanceOf(Date);
    expect(await IpSession.countDocuments()).toBe(1);
  });
});
