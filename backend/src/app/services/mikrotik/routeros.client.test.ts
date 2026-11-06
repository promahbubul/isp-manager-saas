import crypto from "crypto";
import net from "net";
import { afterEach, describe, expect, it } from "vitest";
import { decodeLength, encodeLength, encodeSentence, RouterOsClient, RosError, SentenceParser } from "./routeros.client";

describe("length encoding", () => {
  it.each([0, 1, 0x7f, 0x80, 0x3fff, 0x4000, 0x1fffff, 0x200000, 0xfffffff, 0x10000000])("round-trips %i", (n) => {
    const enc = encodeLength(n);
    expect(decodeLength(enc, 0)).toEqual([n, enc.length]);
  });

  it("parses sentences split across chunks", () => {
    const long = "x".repeat(300); // 2-byte length
    const bytes = Buffer.concat([encodeSentence(["!re", `=comment=${long}`]), encodeSentence(["!done"])]);
    const parser = new SentenceParser();
    const out: string[][] = [];
    for (let i = 0; i < bytes.length; i += 7) out.push(...parser.push(bytes.subarray(i, i + 7)));
    expect(out).toEqual([["!re", `=comment=${long}`], ["!done"]]);
  });
});

/** Tiny fake RouterOS API server. */
function fakeRouter(opts: { legacyLogin?: boolean } = {}) {
  const challenge = "0123456789abcdef0123456789abcdef";
  const server = net.createServer((sock) => {
    const parser = new SentenceParser();
    const send = (...sentences: string[][]) => sock.write(Buffer.concat(sentences.map(encodeSentence)));
    sock.on("data", (chunk) => {
      for (const [cmd, ...words] of parser.push(chunk)) {
        const attr = (k: string) => words.find((w) => w.startsWith(`=${k}=`))?.slice(k.length + 2);
        if (cmd === "/login") {
          if (opts.legacyLogin && !attr("response")) send(["!done", `=ret=${challenge}`]);
          else if (opts.legacyLogin) {
            const md5 = crypto
              .createHash("md5")
              .update(Buffer.concat([Buffer.from([0]), Buffer.from("secret"), Buffer.from(challenge, "hex")]))
              .digest("hex");
            if (attr("response") === `00${md5}`) send(["!done"]);
            else send(["!trap", "=message=invalid user name or password"], ["!done"]);
          } else if (attr("password") === "secret") send(["!done"]);
          else send(["!trap", "=message=invalid user name or password (6)"], ["!done"]);
        } else if (cmd === "/ppp/secret/print") {
          const q = words.find((w) => w.startsWith("?name="))?.slice(6);
          const rows = [
            ["!re", "=.id=*1", "=name=alice", "=profile=10M", "=disabled=false"],
            ["!re", "=.id=*2", "=name=bob", "=profile=20M", "=disabled=true"],
          ].filter((r) => !q || r.includes(`=name=${q}`));
          send(...rows, ["!done"]);
        } else {
          send(["!trap", `=message=no such command`], ["!done"]);
        }
      }
    });
  });
  return new Promise<{ port: number; close: () => void }>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ port: (server.address() as net.AddressInfo).port, close: () => server.close() }),
    ),
  );
}

let cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.forEach((f) => f());
  cleanup = [];
});

describe("RouterOsClient", () => {
  it("logs in and runs commands with queries", async () => {
    const srv = await fakeRouter();
    const client = new RouterOsClient({ host: "127.0.0.1", port: srv.port, user: "admin", password: "secret" });
    cleanup.push(() => client.close(), srv.close);
    await client.connect();

    const all = await client.write("/ppp/secret/print");
    expect(all.map((r) => r.name)).toEqual(["alice", "bob"]);

    // two commands queued back-to-back resolve in order
    const [a, b] = await Promise.all([
      client.write("/ppp/secret/print", {}, { name: "alice" }),
      client.write("/ppp/secret/print", {}, { name: "bob" }),
    ]);
    expect(a[0].profile).toBe("10M");
    expect(b[0].disabled).toBe("true");
  });

  it("supports the pre-6.43 challenge login", async () => {
    const srv = await fakeRouter({ legacyLogin: true });
    const client = new RouterOsClient({ host: "127.0.0.1", port: srv.port, user: "admin", password: "secret" });
    cleanup.push(() => client.close(), srv.close);
    await expect(client.connect()).resolves.toBeUndefined();
  });

  it("rejects wrong password and !trap replies with RosError", async () => {
    const srv = await fakeRouter();
    cleanup.push(srv.close);

    const bad = new RouterOsClient({ host: "127.0.0.1", port: srv.port, user: "admin", password: "nope" });
    cleanup.push(() => bad.close());
    await expect(bad.connect()).rejects.toThrow(/invalid user name or password/);

    const ok = new RouterOsClient({ host: "127.0.0.1", port: srv.port, user: "admin", password: "secret" });
    cleanup.push(() => ok.close());
    await ok.connect();
    await expect(ok.write("/bogus")).rejects.toBeInstanceOf(RosError);
    // the connection is still usable after a trap
    await expect(ok.write("/ppp/secret/print")).resolves.toHaveLength(2);
  });

  it("fails fast when nothing listens", async () => {
    const client = new RouterOsClient({ host: "127.0.0.1", port: 1, user: "a", password: "b", timeout: 2000 });
    await expect(client.connect()).rejects.toThrow(/Cannot connect/);
  });
});
