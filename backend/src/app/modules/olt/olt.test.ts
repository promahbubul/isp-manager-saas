import { afterEach, describe, expect, it } from "vitest";
import { api } from "../../../tests/helpers";
import { createCustomer, setupIsp } from "../../../tests/isp";
import { OLT_PROFILES, onuIdentifier, signalLevel, toDbm } from "../../services/olt/olt.profiles";
import { setSnmpFactory, Varbind } from "../../services/olt/snmp";
import { Customer } from "../customer/customer.model";
import { Olt, pollAllOlts } from "./olt";

const H = OLT_PROFILES.huawei_gpon;
const serial = (vendor: string, hex: string) => Buffer.concat([Buffer.from(vendor, "ascii"), Buffer.from(hex, "hex")]);

/** A fake Huawei OLT with two ONUs on port index 4194312448. */
function fakeOlt(seen: { host?: string; community?: string }) {
  const tables: Record<string, Varbind[]> = {
    [H.id]: [
      { oid: `${H.id}.4194312448.0`, value: serial("HWTC", "1a2b3c4d") },
      { oid: `${H.id}.4194312448.1`, value: serial("HWTC", "99887766") },
    ],
    [H.name!]: [{ oid: `${H.name}.4194312448.0`, value: Buffer.from("rahim-home") }],
    [H.rx]: [
      { oid: `${H.rx}.4194312448.0`, value: -2154 }, // -21.54 dBm
      { oid: `${H.rx}.4194312448.1`, value: -2890 }, // -28.90 dBm (weak)
    ],
  };
  setSnmpFactory((t) => {
    Object.assign(seen, t);
    return { subtree: async (base) => tables[base] ?? [], close: () => undefined };
  });
}

afterEach(() => setSnmpFactory());

describe("OLT / ONU signal", () => {
  it("parses identifiers and dBm values", () => {
    expect(onuIdentifier(serial("HWTC", "1a2b3c4d"))).toBe("HWTC1A2B3C4D");
    expect(onuIdentifier(Buffer.from("aabbccddeeff", "hex"))).toBe("AABBCCDDEEFF");
    expect(toDbm(-2154, 100, 0)).toBe(-21.54);
    expect(toDbm(2147483647, 100, 0)).toBeNull(); // offline
    expect(toDbm(-215, 10, 0)).toBe(-21.5);
    expect([signalLevel(-21), signalLevel(-26), signalLevel(-29), signalLevel(-32), signalLevel(null)]).toEqual(["good", "ok", "weak", "bad", "offline"]);
  });

  it("reads ONUs, matches customers by ONU serial and stores their signal", async () => {
    const seen: { host?: string; community?: string } = {};
    fakeOlt(seen);
    const isp = await setupIsp();
    const c = await createCustomer(isp, { device: { onuMac: "hwtc-1a2b3c4d" } });
    const o = await api().post("/api/v1/olts").set(isp.auth).send({ name: "Mirpur OLT", host: "10.0.0.2", community: "secret-ro", vendor: "huawei_gpon" });
    expect(o.status).toBe(201);
    expect(JSON.stringify(o.body)).not.toContain("secret-ro");

    const poll = await api().post(`/api/v1/olts/${o.body.data._id}/poll`).set(isp.auth);
    expect(poll.status).toBe(200);
    expect(seen).toMatchObject({ host: "10.0.0.2", community: "secret-ro" });
    expect(poll.body.data).toEqual([
      { index: "4194312448.0", onuId: "HWTC1A2B3C4D", name: "rahim-home", rx: -21.54, level: "good", customer: { _id: c.body.data.customer._id, name: "Rahim Uddin", customerId: c.body.data.customer.customerId } },
      { index: "4194312448.1", onuId: "HWTC99887766", rx: -28.9, level: "weak" },
    ]);
    expect(poll.body.message).toContain("1 with weak signal");
    const saved = await Customer.findById(c.body.data.customer._id);
    expect(saved!.device!.onuRx).toBe(-21.54);
    expect((await Olt.findById(o.body.data._id))).toMatchObject({ onuCount: 2, weakCount: 1 });
  });

  it("supports custom OIDs and reports SNMP failures", async () => {
    const isp = await setupIsp();
    const bad = await api().post("/api/v1/olts").set(isp.auth).send({ name: "VSOL", host: "10.0.0.3", community: "public", vendor: "custom" });
    expect(bad.status).toBe(400); // custom needs OIDs
    const o = await api()
      .post("/api/v1/olts")
      .set(isp.auth)
      .send({ name: "VSOL", host: "10.0.0.3", community: "public", vendor: "custom", oids: { id: "1.3.6.1.4.1.37950.1.1.5.12.1.12.1.6", rx: "1.3.6.1.4.1.37950.1.1.5.12.2.1.8.1.7", rxDivisor: 100, rxOffset: 0 } });
    expect(o.status).toBe(201);
    setSnmpFactory(() => ({
      subtree: async () => {
        throw new Error("Request timed out");
      },
      close: () => undefined,
    }));
    const r = await api().post(`/api/v1/olts/${o.body.data._id}/poll`).set(isp.auth);
    expect(r.status).toBe(502);
    expect(r.body.message).toContain("timed out");
    expect((await pollAllOlts()).failed).toBe(1);
  });
});
