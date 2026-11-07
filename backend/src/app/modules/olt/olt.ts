import { Request, Response, Router } from "express";
import { isValidObjectId, model, Schema, Types } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { auth, authorize, requireWritableTenant } from "../../middlewares/auth";
import { validateBody } from "../../middlewares/validateRequest";
import { tenantPlugin } from "../../plugins/tenant.plugin";
import { normalizeOnuId, OLT_PROFILES, OLT_VENDORS, OltOids, OltVendor, onuIdentifier, signalLevel, suffixOf, toDbm } from "../../services/olt/olt.profiles";
import { withSnmp } from "../../services/olt/snmp";
import { decrypt, encrypt } from "../../utils/encryption";
import sendResponse from "../../utils/sendResponse";
import { runWithTenant } from "../../utils/tenantContext";
import { audit } from "../activityLog/activityLog.service";
import { Company } from "../company/company.model";
import { Customer } from "../customer/customer.model";

/** A fiber OLT the software reads ONU signal (RX power) from over SNMP (read-only). */
export interface IOlt {
  company: Types.ObjectId;
  name: string;
  host: string;
  port: number;
  /** SNMP v2c read community, encrypted */
  community: string;
  vendor: OltVendor;
  /** used when vendor = custom (or to override a profile) */
  oids?: Partial<OltOids>;
  isActive: boolean;
  lastPollAt?: Date;
  lastError?: string;
  onuCount?: number;
  weakCount?: number;
}

const schema = new Schema<IOlt>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    host: { type: String, required: true, trim: true },
    port: { type: Number, default: 161 },
    community: { type: String, required: true, select: false },
    vendor: { type: String, enum: OLT_VENDORS, required: true },
    oids: { id: String, name: String, rx: String, rxDivisor: Number, rxOffset: Number },
    isActive: { type: Boolean, default: true },
    lastPollAt: Date,
    lastError: String,
    onuCount: Number,
    weakCount: Number,
  },
  { timestamps: true },
);
schema.plugin(tenantPlugin);
schema.index({ company: 1, name: 1 }, { unique: true });
export const Olt = model<IOlt>("Olt", schema);

const oidStr = z.string().trim().regex(/^\d+(\.\d+)+$/, "An OID like 1.3.6.1.4.1...");
const fields = {
  name: z.string().trim().min(2).max(100),
  host: z.string().trim().min(3).max(253),
  port: z.coerce.number().int().min(1).max(65535),
  community: z.string().min(1).max(100),
  vendor: z.enum(OLT_VENDORS),
  oids: z.object({ id: oidStr, name: oidStr.optional().or(z.literal("")), rx: oidStr, rxDivisor: z.coerce.number().positive(), rxOffset: z.coerce.number() }).partial(),
  isActive: z.boolean(),
};
const createSchema = z
  .object({ ...fields, port: fields.port.default(161), isActive: fields.isActive.default(true), oids: fields.oids.optional() })
  .refine((d) => d.vendor !== "custom" || (d.oids?.id && d.oids?.rx), { path: ["oids"], message: "Custom OLTs need the ONU id OID and the RX power OID" });
const updateSchema = z.object(fields).partial();

function effectiveOids(o: Pick<IOlt, "vendor" | "oids">): OltOids {
  const base = o.vendor === "custom" ? { id: "", rx: "", rxDivisor: 1, rxOffset: 0 } : OLT_PROFILES[o.vendor];
  const x = o.oids ?? {};
  return { id: x.id || base.id, name: x.name || (base as OltOids).name, rx: x.rx || base.rx, rxDivisor: x.rxDivisor ?? base.rxDivisor, rxOffset: x.rxOffset ?? base.rxOffset };
}

export type OnuReading = { index: string; onuId: string; name?: string; rx: number | null; level: ReturnType<typeof signalLevel>; customer?: { _id: string; name: string; customerId: string } };

/** Read every ONU's id and RX from the OLT and match them to customers by ONU MAC/serial. */
export async function readOlt(oltId: string, save = true): Promise<OnuReading[]> {
  const olt = await Olt.findById(oltId).select("+community");
  if (!olt) throw new AppError(404, "OLT not found");
  const oids = effectiveOids(olt);
  try {
    const [ids, names, rx] = await withSnmp({ host: olt.host, port: olt.port, community: decrypt(olt.community) }, async (c) =>
      Promise.all([c.subtree(oids.id), oids.name ? c.subtree(oids.name) : Promise.resolve([]), c.subtree(oids.rx)]),
    );
    const nameOf = new Map(names.map((v) => [suffixOf(v.oid, oids.name!), Buffer.isBuffer(v.value) ? v.value.toString("utf8").trim() : String(v.value ?? "")]));
    const rxOf = new Map(rx.map((v) => [suffixOf(v.oid, oids.rx), toDbm(v.value, oids.rxDivisor, oids.rxOffset)]));
    const readings: OnuReading[] = ids.map((v) => {
      const index = suffixOf(v.oid, oids.id);
      const value = rxOf.get(index) ?? null;
      return { index, onuId: onuIdentifier(v.value), name: nameOf.get(index), rx: value, level: signalLevel(value) };
    });

    // match customers: device.onuMac normalised the same way
    const customers = await Customer.find({ deletedAt: null, "device.onuMac": { $exists: true, $ne: "" } }).select("name customerId device.onuMac");
    const byOnu = new Map(customers.map((c) => [normalizeOnuId(c.device?.onuMac ?? ""), c]));
    const now = new Date();
    for (const r of readings) {
      const c = byOnu.get(r.onuId);
      if (!c) continue;
      r.customer = { _id: c.id, name: c.name, customerId: c.customerId };
      if (save) await Customer.updateOne({ _id: c._id }, { "device.onuRx": r.rx, "device.onuRxAt": now, "device.olt": olt._id });
    }
    if (save) {
      olt.set({ lastPollAt: now, lastError: undefined, onuCount: readings.length, weakCount: readings.filter((r) => r.level === "weak" || r.level === "bad").length });
      await olt.save();
    }
    return readings;
  } catch (err) {
    if (save) {
      olt.set({ lastPollAt: new Date(), lastError: (err as Error).message.slice(0, 300) });
      await olt.save();
    }
    throw new AppError(502, `Could not read the OLT: ${(err as Error).message}`);
  }
}

/** Worker job: refresh ONU signal for every active OLT of every ISP. */
export async function pollAllOlts() {
  const companies = await Company.find({ status: { $in: ["trial", "active", "past_due"] }, deletedAt: null }).select("_id");
  const result = { olts: 0, failed: 0, onus: 0 };
  for (const co of companies) {
    await runWithTenant(co.id, async () => {
      for (const o of await Olt.find({ isActive: true }).select("_id")) {
        try {
          result.onus += (await readOlt(o.id)).length;
          result.olts += 1;
        } catch {
          result.failed += 1;
        }
      }
    });
  }
  return result;
}

export const oltRoutes = Router();
oltRoutes.use(auth(), requireWritableTenant);
const id = (req: Request) => {
  const v = String(req.params.id);
  if (!isValidObjectId(v)) throw new AppError(400, "Invalid OLT id");
  return v;
};

oltRoutes.get("/profiles", authorize("router.view"), (_req: Request, res: Response) => {
  sendResponse(res, { message: "OLT profiles", data: OLT_PROFILES });
});

oltRoutes.get("/", authorize("router.view"), async (_req: Request, res: Response) => {
  sendResponse(res, { message: "OLTs", data: await Olt.find().sort("name") });
});

oltRoutes.post("/", authorize("router.manage"), validateBody(createSchema), audit("olt.create", "olt"), async (req: Request, res: Response) => {
  const { community, ...rest } = req.body as z.infer<typeof createSchema>;
  const o = await Olt.create({ ...rest, community: encrypt(community) });
  sendResponse(res, { statusCode: 201, message: "OLT added", data: o });
});

oltRoutes.patch("/:id", authorize("router.manage"), validateBody(updateSchema), audit("olt.update", "olt"), async (req: Request, res: Response) => {
  const o = await Olt.findById(id(req));
  if (!o) throw new AppError(404, "OLT not found");
  const { community, oids, ...rest } = req.body as z.infer<typeof updateSchema>;
  o.set(rest);
  if (oids) for (const [k, v] of Object.entries(oids)) o.set(`oids.${k}`, v === "" ? undefined : v);
  if (community) o.community = encrypt(community);
  await o.save();
  sendResponse(res, { message: "OLT updated", data: o });
});

oltRoutes.delete("/:id", authorize("router.manage"), audit("olt.delete", "olt"), async (req: Request, res: Response) => {
  const r = await Olt.deleteOne({ _id: id(req) });
  if (!r.deletedCount) throw new AppError(404, "OLT not found");
  sendResponse(res, { message: "OLT removed" });
});

/** Live read now (also saves each matched customer's signal). */
oltRoutes.post("/:id/poll", authorize("router.view"), async (req: Request, res: Response) => {
  const readings = await readOlt(id(req));
  const weak = readings.filter((r) => r.level === "weak" || r.level === "bad").length;
  sendResponse(res, { message: `${readings.length} ONU(s) read${weak ? `, ${weak} with weak signal` : ""}`, data: readings });
});

