/**
 * Where each OLT brand keeps the ONU list and the received optical power (RX) in SNMP.
 * The ONU id table and the RX table share the same index suffix (port.onu), so they are
 * joined on it. Values outside these profiles can be set per OLT ("custom").
 *
 * huawei_gpon: hwGponDeviceOntSn / hwGponDeviceOntDespt / hwGponOntOpticalDdmRxPower (0.01 dBm)
 * bdcom_epon:  onuMacAddress / onuReceivedOpticalPower (0.1 dBm) — check against your firmware
 */
export const OLT_VENDORS = ["huawei_gpon", "bdcom_epon", "custom"] as const;
export type OltVendor = (typeof OLT_VENDORS)[number];

export type OltOids = { id: string; name?: string; rx: string; rxDivisor: number; rxOffset: number };

export const OLT_PROFILES: Record<Exclude<OltVendor, "custom">, OltOids & { label: string; verified: boolean }> = {
  huawei_gpon: {
    label: "Huawei GPON (MA5608T / MA5683T / MA5800)",
    id: "1.3.6.1.4.1.2011.6.128.1.1.2.43.1.3",
    name: "1.3.6.1.4.1.2011.6.128.1.1.2.43.1.9",
    rx: "1.3.6.1.4.1.2011.6.128.1.1.2.51.1.4",
    rxDivisor: 100,
    rxOffset: 0,
    verified: true,
  },
  bdcom_epon: {
    label: "BDCOM EPON (P3310 / P3608) — verify OIDs",
    id: "1.3.6.1.4.1.3320.101.10.1.1.3",
    rx: "1.3.6.1.4.1.3320.101.10.5.1.5",
    rxDivisor: 10,
    rxOffset: 0,
    verified: false,
  },
};

/** RX values that mean "no reading" (ONU offline) on common firmwares. */
const NO_READING = new Set([2147483647, -2147483648, 65535, 0]);

export function toDbm(raw: unknown, divisor: number, offset: number): number | null {
  const n = typeof raw === "number" ? raw : Number(Buffer.isBuffer(raw) ? raw.toString() : raw);
  if (!Number.isFinite(n) || NO_READING.has(n)) return null;
  const dbm = n / (divisor || 1) + (offset || 0);
  return dbm < -50 || dbm > 10 ? null : Math.round(dbm * 100) / 100;
}

/**
 * ONU identifier → the same text staff type in "ONU MAC / serial":
 *  - 6 bytes → MAC "AABBCCDDEEFF"
 *  - 8 bytes → GPON serial "HWTC1A2B3C4D" (4 ASCII vendor letters + 4 bytes hex)
 *  - printable text → as is
 */
export function onuIdentifier(v: unknown): string {
  if (Buffer.isBuffer(v)) {
    if (v.length === 6) return v.toString("hex").toUpperCase();
    if (v.length === 8) {
      const vendor = v.subarray(0, 4).toString("ascii");
      if (/^[A-Z0-9]{4}$/i.test(vendor)) return (vendor + v.subarray(4).toString("hex")).toUpperCase();
      return v.toString("hex").toUpperCase();
    }
    const s = v.toString("utf8");
    return /^[\x20-\x7e]+$/.test(s) ? normalizeOnuId(s) : v.toString("hex").toUpperCase();
  }
  return normalizeOnuId(String(v ?? ""));
}

/** "aa:bb:cc-dd.ee ff" / "HWTC-1a2b3c4d" → "AABBCCDDEEFF" / "HWTC1A2B3C4D" */
export const normalizeOnuId = (s: string) => s.replace(/[^0-9a-z]/gi, "").toUpperCase();

/** "1.3.6.1...51.1.4.4194312448.7" with base "...51.1.4" → "4194312448.7" */
export const suffixOf = (oid: string, base: string) => (oid.startsWith(`${base}.`) ? oid.slice(base.length + 1) : oid);

/** Signal quality bands used across the UI. */
export function signalLevel(dbm: number | null): "offline" | "good" | "ok" | "weak" | "bad" {
  if (dbm === null) return "offline";
  if (dbm >= -24) return "good";
  if (dbm >= -27) return "ok";
  if (dbm >= -30) return "weak";
  return "bad";
}
