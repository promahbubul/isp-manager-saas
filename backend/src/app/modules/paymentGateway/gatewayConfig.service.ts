import { Types } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { GATEWAY_IDS, GATEWAY_META, GatewayAccount, GatewayId } from "../../services/payment/gateway.types";
import { decrypt, encrypt } from "../../utils/encryption";
import { GatewayConfig } from "./gatewayConfig.model";

type Owner = string | Types.ObjectId | null; // null = platform

const ownerFilter = (owner: Owner) => ({ company: owner === null ? null : new Types.ObjectId(String(owner)) });

const mask = (v: string) => (v.length <= 4 ? "••••" : `••••${v.slice(-4)}`);

function readCredentials(enc?: string): Record<string, string> {
  if (!enc) return {};
  try {
    return JSON.parse(decrypt(enc)) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Settings view for admins: secrets masked, never returned in clear text. */
export async function listGatewaySettings(owner: Owner) {
  const rows = await GatewayConfig.find(ownerFilter(owner)).select("+credentials");
  return GATEWAY_IDS.map((id) => {
    const row = rows.find((r) => r.gateway === id);
    const creds = readCredentials(row?.credentials);
    const meta = GATEWAY_META[id];
    return {
      gateway: id,
      label: meta.label,
      help: meta.help,
      currencies: meta.currencies,
      enabled: row?.enabled ?? false,
      sandbox: row?.sandbox ?? true,
      instructions: row?.instructions ?? "",
      configured: meta.fields.filter((f) => f.required).every((f) => Boolean(creds[f.key])),
      fields: meta.fields.map((f) => ({
        ...f,
        value: f.secret ? undefined : (creds[f.key] ?? ""),
        hint: f.secret && creds[f.key] ? mask(creds[f.key]) : undefined,
      })),
    };
  });
}

export const updateGatewaySchema = z.object({
  enabled: z.boolean().optional(),
  sandbox: z.boolean().optional(),
  instructions: z.string().trim().max(1000).optional(),
  /** only the keys sent are changed; empty string keeps the current value */
  credentials: z.record(z.string(), z.string().trim().max(500)).optional(),
});

export async function updateGatewaySettings(owner: Owner, gateway: string, input: z.infer<typeof updateGatewaySchema>) {
  if (!(GATEWAY_IDS as readonly string[]).includes(gateway)) throw new AppError(404, "Unknown payment gateway");
  const id = gateway as GatewayId;
  const meta = GATEWAY_META[id];
  const row =
    (await GatewayConfig.findOne({ ...ownerFilter(owner), gateway: id }).select("+credentials")) ??
    new GatewayConfig({ ...ownerFilter(owner), gateway: id });

  const creds = readCredentials(row.credentials);
  for (const [k, v] of Object.entries(input.credentials ?? {})) {
    if (!meta.fields.some((f) => f.key === k)) throw new AppError(400, `Unknown field "${k}" for ${id}`);
    if (v !== "") creds[k] = v;
  }
  const missing = meta.fields.filter((f) => f.required && !creds[f.key]).map((f) => f.label);
  const enabled = input.enabled ?? row.enabled;
  if (enabled && missing.length) throw new AppError(400, `Fill in ${missing.join(", ")} before enabling ${meta.label}`);
  if (enabled && id === "manual" && !(input.instructions ?? row.instructions)) {
    throw new AppError(400, "Write payment instructions (which number to send money to) before enabling manual payments");
  }

  row.set({
    enabled,
    sandbox: input.sandbox ?? row.sandbox,
    instructions: input.instructions ?? row.instructions,
    credentials: Object.keys(creds).length ? encrypt(JSON.stringify(creds)) : undefined,
  });
  await row.save();
  return (await listGatewaySettings(owner)).find((g) => g.gateway === id);
}

/** What a payer may choose: enabled gateways, public info only. */
export async function enabledMethods(owner: Owner) {
  const rows = await GatewayConfig.find({ ...ownerFilter(owner), enabled: true });
  return GATEWAY_IDS.filter((id) => rows.some((r) => r.gateway === id)).map((id) => ({
    gateway: id,
    label: GATEWAY_META[id].label,
    currencies: GATEWAY_META[id].currencies,
    instructions: id === "manual" ? rows.find((r) => r.gateway === id)?.instructions : undefined,
    sandbox: rows.find((r) => r.gateway === id)?.sandbox ?? false,
  }));
}

/** Decrypted account for server-side use. Throws if the method is off. */
export async function getGatewayAccount(owner: Owner, gateway: GatewayId): Promise<GatewayAccount & { instructions?: string }> {
  const row = await GatewayConfig.findOne({ ...ownerFilter(owner), gateway }).select("+credentials");
  if (!row?.enabled) throw new AppError(400, `${GATEWAY_META[gateway]?.label ?? gateway} is not available`);
  return { credentials: readCredentials(row.credentials), sandbox: row.sandbox, instructions: row.instructions };
}
