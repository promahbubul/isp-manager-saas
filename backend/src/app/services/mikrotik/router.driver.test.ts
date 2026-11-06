import net from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RouterOsDriver } from "./router.driver";
import { encodeSentence, SentenceParser } from "./routeros.client";

/**
 * Fake RouterOS speaking the real API protocol, with just enough of
 * /ppp secret|active|profile and /system to exercise RouterOsDriver end-to-end.
 */
type Row = Record<string, string>;
const state = {
  secrets: [] as Row[],
  active: [] as Row[],
  nextId: 1,
};

function handle(cmd: string, words: string[]): string[][] {
  const attrs: Row = {};
  const queries: Row = {};
  for (const w of words) {
    if (w.startsWith("=")) {
      const i = w.indexOf("=", 1);
      attrs[w.slice(1, i)] = w.slice(i + 1);
    } else if (w.startsWith("?")) {
      const i = w.indexOf("=");
      queries[w.slice(1, i)] = w.slice(i + 1);
    }
  }
  const match = (r: Row) => Object.entries(queries).every(([k, v]) => r[k] === v);
  const re = (rows: Row[]) => rows.map((r) => ["!re", ...Object.entries(r).map(([k, v]) => `=${k}=${v}`)]);
  const trap = (m: string) => [["!trap", `=message=${m}`], ["!done"]];

  switch (cmd) {
    case "/login":
      return attrs.password === "pw" ? [["!done"]] : trap("invalid user name or password");
    case "/system/resource/print":
      return [...re([{ version: "7.15.3 (stable)", "board-name": "CCR2004", uptime: "3d", "cpu-load": "7" }]), ["!done"]];
    case "/system/identity/print":
      return [...re([{ name: "Core-1" }]), ["!done"]];
    case "/ppp/profile/print":
      return [...re([{ ".id": "*P1", name: "default" }, { ".id": "*P2", name: "10M" }]), ["!done"]];
    case "/ppp/secret/print":
      return [...re(state.secrets.filter(match)), ["!done"]];
    case "/ppp/secret/add": {
      if (state.secrets.some((s) => s.name === attrs.name)) return trap("failure: secret with the same name already exists");
      const row = { ".id": `*${state.nextId++}`, disabled: "false", ...attrs };
      state.secrets.push(row);
      return [["!done", `=ret=${row[".id"]}`]];
    }
    case "/ppp/secret/set": {
      const s = state.secrets.find((x) => x[".id"] === attrs[".id"]);
      if (!s) return trap("no such item");
      Object.assign(s, attrs);
      if (attrs.disabled) s.disabled = attrs.disabled === "yes" ? "true" : "false";
      return [["!done"]];
    }
    case "/ppp/secret/remove":
      state.secrets = state.secrets.filter((x) => x[".id"] !== attrs[".id"]);
      return [["!done"]];
    case "/ppp/active/print":
      return [...re(state.active.filter(match)), ["!done"]];
    case "/ppp/active/remove":
      state.active = state.active.filter((x) => x[".id"] !== attrs[".id"]);
      return [["!done"]];
    default:
      return trap("no such command prefix");
  }
}

let server: net.Server;
let port: number;

beforeAll(async () => {
  server = net.createServer((sock) => {
    const parser = new SentenceParser();
    sock.on("data", (chunk) => {
      for (const [cmd, ...words] of parser.push(chunk)) {
        sock.write(Buffer.concat(handle(cmd, words).map(encodeSentence)));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as net.AddressInfo).port;
});

afterAll(() => server.close());

const connect = () => RouterOsDriver.connect({ host: "127.0.0.1", port, user: "api", password: "pw" });

describe("RouterOsDriver over the RouterOS protocol", () => {
  it("reads system info and profiles", async () => {
    const d = await connect();
    try {
      const info = await d.info();
      expect(info).toMatchObject({ identity: "Core-1", version: "7.15.3 (stable)", board: "CCR2004", cpuLoad: 7 });
      expect(await d.listProfiles()).toEqual(["default", "10M"]);
    } finally {
      d.close();
    }
  });

  it("upserts, disables, renames, kicks and removes PPP secrets", async () => {
    const d = await connect();
    try {
      await d.upsertSecret({ name: "rahim", password: "p1", profile: "10M", comment: "C-00001 Rahim" });
      expect(await d.findSecret("rahim")).toMatchObject({ name: "rahim", profile: "10M", disabled: false, service: "pppoe" });

      // upsert again → update, not duplicate
      await d.upsertSecret({ name: "rahim", password: "p2", profile: "default", disabled: true });
      expect((await d.listSecrets()).filter((s) => s.name === "rahim")).toHaveLength(1);
      expect(await d.findSecret("rahim")).toMatchObject({ profile: "default", disabled: true, password: "p2" });

      await d.setSecretDisabled("rahim", false);
      expect((await d.findSecret("rahim"))?.disabled).toBe(false);

      await d.renameSecret("rahim", "rahim2");
      expect(await d.findSecret("rahim")).toBeNull();
      expect(await d.findSecret("rahim2")).not.toBeNull();

      state.active.push({ ".id": "*A1", name: "rahim2", address: "10.10.0.9", "caller-id": "AA:BB", uptime: "1h" });
      expect(await d.findActive("rahim2")).toMatchObject({ address: "10.10.0.9", callerId: "AA:BB" });
      expect(await d.kick("rahim2")).toBe(true);
      expect(await d.kick("rahim2")).toBe(false);

      await d.removeSecret("rahim2");
      expect(await d.findSecret("rahim2")).toBeNull();
      await expect(d.setSecretDisabled("ghost", true)).rejects.toThrow(/not found/);
    } finally {
      d.close();
    }
  });

  it("rejects bad credentials", async () => {
    await expect(RouterOsDriver.connect({ host: "127.0.0.1", port, user: "api", password: "wrong" })).rejects.toThrow(
      /invalid user name or password/,
    );
  });
});
