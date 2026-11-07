import crypto from "node:crypto";
import fs from "node:fs/promises";
import config from "../../config";
import AppError from "../../errors/AppError";
import { MikrotikRouter } from "../../modules/router/router.model";
import { decrypt, encrypt } from "../../utils/encryption";
import { tenantStorage } from "../../utils/tenantContext";

/**
 * FreeRADIUS clients: every RADIUS-mode router needs a block in clients.conf with its
 * source IP and a shared secret. We generate the secret per router and, when
 * RADIUS_CLIENTS_FILE is set, rewrite that file (FreeRADIUS must be restarted/HUPed after).
 */
export async function writeRadiusClients() {
  if (!config.radius.clientsFile) return 0;
  // shared by every ISP on the server: read all routers, outside any tenant scope
  const routers = await tenantStorage.exit(() => MikrotikRouter.find({ authMode: "radius", isActive: true }).select("+radius.secret").exec());
  const blocks = routers
    .filter((r) => r.radius?.secret)
    .map((r) => `client rt-${r.id} {\n\tipaddr = ${r.radius?.nasIp || r.host}\n\tsecret = ${decrypt(r.radius!.secret!)}\n\tshortname = rt-${r.id}\n\tnas_type = other\n}`);
  const tmp = `${config.radius.clientsFile}.tmp`;
  await fs.writeFile(tmp, `# Managed by ISP Manager — do not edit by hand\n${blocks.join("\n\n")}\n`, { mode: 0o640 });
  await fs.rename(tmp, config.radius.clientsFile);
  return blocks.length;
}

/** Creates the router's RADIUS secret if needed and returns the MikroTik commands. */
export async function radiusSetup(routerId: string) {
  if (!config.radius.apiSecret || !config.radius.host) {
    throw new AppError(503, "RADIUS is not set up on this server yet. Ask the platform admin (RADIUS_API_SECRET, RADIUS_HOST).");
  }
  const router = await MikrotikRouter.findById(routerId).select("+radius.secret");
  if (!router) throw new AppError(404, "Router not found");
  if (!router.radius?.secret) {
    router.set("radius.secret", encrypt(crypto.randomBytes(18).toString("base64url")));
  }
  router.authMode = "radius";
  await router.save();
  await writeRadiusClients().catch((e) => console.error("[radius] could not write clients file:", e.message));
  const secret = decrypt(router.radius!.secret!);
  const script = [
    "# ISP Manager RADIUS (PPPoE). Paste into New Terminal.",
    `/radius add service=ppp address=${config.radius.host} secret="${secret}" timeout=3s comment="ISP Manager"`,
    "/ppp aaa set use-radius=yes accounting=yes interim-update=5m",
    "/radius incoming set accept=yes",
    `/system identity set name=rt-${router.id}`,
    "# Optional: remove the old local secrets after RADIUS works: /ppp secret remove [find]",
  ].join("\n");
  return { router, script, nasIp: router.radius?.nasIp || router.host };
}
