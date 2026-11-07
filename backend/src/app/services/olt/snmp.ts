// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — net-snmp ships no type definitions
import snmp from "net-snmp";

export type Varbind = { oid: string; value: Buffer | number | string | null };

/** What the OLT feature needs from SNMP; tests replace it with a fake. */
export interface SnmpClient {
  /** every OID under `base` (SNMP v2c getBulk) */
  subtree(base: string): Promise<Varbind[]>;
  close(): void;
}

export type SnmpTarget = { host: string; port: number; community: string };

type NetSnmpVarbind = { oid: string; value: unknown; type: number };

function realClient(t: SnmpTarget): SnmpClient {
  const session = snmp.createSession(t.host, t.community, { port: t.port, version: snmp.Version2c, timeout: 4000, retries: 1 });
  return {
    subtree(base) {
      return new Promise((resolve, reject) => {
        const out: Varbind[] = [];
        session.subtree(
          base,
          20,
          (varbinds: NetSnmpVarbind[]) => {
            for (const vb of varbinds) if (!snmp.isVarbindError(vb)) out.push({ oid: vb.oid, value: vb.value as Varbind["value"] });
          },
          (error: Error | null) => (error ? reject(error) : resolve(out)),
        );
      });
    },
    close() {
      session.close();
    },
  };
}

let factory: (t: SnmpTarget) => SnmpClient = realClient;
export const setSnmpFactory = (f?: (t: SnmpTarget) => SnmpClient) => {
  factory = f ?? realClient;
};

export async function withSnmp<T>(t: SnmpTarget, fn: (c: SnmpClient) => Promise<T>): Promise<T> {
  const c = factory(t);
  try {
    return await fn(c);
  } finally {
    c.close();
  }
}
