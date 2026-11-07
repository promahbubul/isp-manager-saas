import crypto from "node:crypto";
import fs from "node:fs/promises";
import { Types } from "mongoose";
import config from "../../config";
import AppError from "../../errors/AppError";
import { Counter } from "../../modules/counter/counter.model";
import { MikrotikRouter } from "../../modules/router/router.model";
import { decrypt, encrypt } from "../../utils/encryption";
import { tenantStorage } from "../../utils/tenantContext";

/**
 * SSTP VPN for routers that cannot run WireGuard (RouterOS 6). The server side is any
 * SSTP server that reads a pppd-style chap-secrets file (accel-ppp, SoftEther bridge...).
 */
const PLATFORM = new Types.ObjectId("000000000000000000000000");
const prefix = () => config.sstp.subnet.split(".").slice(0, 2).join(".");
export const sstpServerIp = () => `${prefix()}.0.1`;

async function nextIp() {
  const doc = await Counter.findOneAndUpdate({ company: PLATFORM, key: "sstp" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  const n = doc!.seq + 1;
  if (n > 65_533) throw new AppError(507, "The SSTP address range is full");
  return `${prefix()}.${Math.floor(n / 256)}.${n % 256 || 1}`;
}

/** Rewrite the whole chap-secrets file from the database (simple and always consistent). */
export async function writeSstpSecrets() {
  if (!config.sstp.enabled || !config.sstp.secretsFile) return 0;
  // The file is shared by every ISP: read all routers, outside the caller's tenant scope.
  const routers = await tenantStorage.exit(() => MikrotikRouter.find({ connectionMode: "vpn", "vpn.type": "sstp" }).select("+vpn.sstpPassword").exec());
  const lines = routers
    .filter((r) => r.vpn?.sstpUser && r.vpn.sstpPassword)
    .map((r) => `${r.vpn!.sstpUser}\t*\t"${decrypt(r.vpn!.sstpPassword!)}"\t${r.vpn!.address}`);
  const tmp = `${config.sstp.secretsFile}.tmp`;
  await fs.writeFile(tmp, `# Managed by ISP Manager — do not edit by hand\n${lines.join("\n")}\n`, { mode: 0o600 });
  await fs.rename(tmp, config.sstp.secretsFile);
  return lines.length;
}

export function sstpScript(v: { user: string; password: string }) {
  return [
    "# ISP Manager VPN over SSTP (RouterOS 6/7). Paste into New Terminal.",
    `/interface sstp-client add name=isp-manager connect-to=${config.sstp.host} port=443 user=${v.user} password="${v.password}" profile=default-encryption verify-server-certificate=no disabled=no`,
    `/ip firewall filter add chain=input action=accept protocol=tcp dst-port=8728 src-address=${sstpServerIp()} in-interface=isp-manager comment="ISP Manager API" place-before=0`,
    "/ip service enable api",
  ].join("\n");
}

export async function enableRouterSstp(routerId: string) {
  if (!config.sstp.enabled || !config.sstp.host) throw new AppError(503, "SSTP VPN is not set up on this server yet. Ask the platform admin (SSTP_ENABLED, SSTP_HOST).");
  const router = await MikrotikRouter.findById(routerId).select("+vpn.sstpPassword");
  if (!router) throw new AppError(404, "Router not found");
  if (router.vpn?.type !== "sstp" || !router.vpn.sstpUser) {
    router.vpn = {
      type: "sstp",
      sstpUser: `r${crypto.randomBytes(5).toString("hex")}`,
      sstpPassword: encrypt(crypto.randomBytes(12).toString("base64url")),
      address: await nextIp(),
      createdAt: new Date(),
    };
  }
  router.connectionMode = "vpn";
  router.host = router.vpn.address;
  router.port = 8728;
  router.useSSL = false;
  await router.save();
  await writeSstpSecrets().catch((e) => console.error("[sstp] could not write secrets:", e.message));
  return { router, script: sstpScript({ user: router.vpn.sstpUser!, password: decrypt(router.vpn.sstpPassword!) }) };
}
