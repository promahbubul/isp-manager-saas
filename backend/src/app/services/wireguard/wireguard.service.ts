import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { Types } from "mongoose";
import config from "../../config";
import AppError from "../../errors/AppError";
import { Counter } from "../../modules/counter/counter.model";
import { MikrotikRouter } from "../../modules/router/router.model";
import { decrypt, encrypt } from "../../utils/encryption";

const run = promisify(execFile);

/** WireGuard keys are raw Curve25519 keys in standard base64. */
export function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("x25519");
  const b64 = (k: crypto.KeyObject, field: "x" | "d") => Buffer.from(k.export({ format: "jwk" })[field] as string, "base64url").toString("base64");
  return { publicKey: b64(publicKey, "x"), privateKey: b64(privateKey, "d") };
}

/** The tunnel network is shared by every ISP on this server, so the counter is platform-wide. */
const PLATFORM = new Types.ObjectId("000000000000000000000000");
const prefix = () => config.wireguard.subnet.split(".").slice(0, 2).join(".");
export const serverTunnelIp = () => `${prefix()}.0.1`;

async function nextTunnelIp() {
  const doc = await Counter.findOneAndUpdate({ company: PLATFORM, key: "wireguard" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  const n = doc!.seq + 1; // .0.1 is the server
  if (n > 65_533) throw new AppError(507, "The VPN address range is full");
  return `${prefix()}.${Math.floor(n / 256)}.${n % 256 || 1}`;
}

function assertConfigured() {
  const wg = config.wireguard;
  if (!wg.enabled || !wg.endpoint || !wg.serverPublicKey) {
    throw new AppError(503, "VPN mode is not set up on this server yet. Ask the platform admin (WG_ENABLED, WG_ENDPOINT, WG_SERVER_PUBLIC_KEY).");
  }
}

async function wg(args: string[]) {
  if (!config.wireguard.apply) return;
  await run("wg", args, { timeout: 10_000 });
}

/** RouterOS v7 commands the ISP pastes into the router's terminal. */
export function routerScript(vpn: { privateKey: string; address: string }) {
  const [host, port = "51820"] = (config.wireguard.endpoint ?? "").split(":");
  return [
    "# ISP Manager VPN (RouterOS 7+). Paste into New Terminal.",
    `/interface wireguard add name=isp-manager listen-port=13231 private-key="${vpn.privateKey}"`,
    `/interface wireguard peers add interface=isp-manager public-key="${config.wireguard.serverPublicKey}" endpoint-address=${host} endpoint-port=${port} allowed-address=${serverTunnelIp()}/32 persistent-keepalive=25s`,
    `/ip address add address=${vpn.address}/16 interface=isp-manager`,
    `/ip firewall filter add chain=input action=accept protocol=tcp dst-port=8728 src-address=${serverTunnelIp()} in-interface=isp-manager comment="ISP Manager API" place-before=0`,
    "/ip service enable api",
  ].join("\n");
}

/** Create (or show again) the tunnel for a router and switch it to VPN mode. */
export async function enableRouterVpn(routerId: string) {
  assertConfigured();
  const router = await MikrotikRouter.findById(routerId).select("+vpn.privateKey");
  if (!router) throw new AppError(404, "Router not found");
  if (router.vpn?.type === "sstp" || !router.vpn?.publicKey) {
    const keys = generateKeyPair();
    router.vpn = { type: "wireguard", publicKey: keys.publicKey, privateKey: encrypt(keys.privateKey), address: await nextTunnelIp(), createdAt: new Date() };
  }
  await wg(["set", config.wireguard.iface, "peer", router.vpn.publicKey!, "allowed-ips", `${router.vpn.address}/32`]);
  router.connectionMode = "vpn";
  router.host = router.vpn.address;
  router.port = 8728;
  router.useSSL = false;
  await router.save();
  return { router, script: routerScript({ privateKey: decrypt(router.vpn.privateKey!), address: router.vpn.address }) };
}

/** Back to a public IP: drop the peer. */
export async function disableRouterVpn(routerId: string, host: string) {
  const router = await MikrotikRouter.findById(routerId);
  if (!router) throw new AppError(404, "Router not found");
  if (router.vpn?.publicKey) await wg(["set", config.wireguard.iface, "peer", router.vpn.publicKey, "remove"]).catch(() => undefined);
  router.vpn = undefined;
  router.connectionMode = "public";
  router.host = host;
  await router.save();
  return router;
}

/**
 * Re-add every router peer (peers added with `wg set` are lost when wg0 restarts).
 * Called at API start when WG_APPLY=true; runs outside any tenant context.
 */
export async function syncAllPeers() {
  if (!config.wireguard.enabled || !config.wireguard.apply) return 0;
  const routers = await MikrotikRouter.find({ connectionMode: "vpn", "vpn.publicKey": { $exists: true } }).select("vpn");
  for (const r of routers) await wg(["set", config.wireguard.iface, "peer", r.vpn!.publicKey!, "allowed-ips", `${r.vpn!.address}/32`]).catch((e) => console.error("[wg] peer", r.id, e.message));
  return routers.length;
}
