import { isValidObjectId } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { withRouter } from "../../services/mikrotik/mikrotik.service";
import { buildXlsx, readXlsx, XlsxColumn } from "../../services/excel/excel.service";
import { runInBackground } from "../../utils/background";
import { encrypt } from "../../utils/encryption";
import { normalizeBdPhone } from "../../utils/phone";
import { objectId } from "../../utils/zod";
import { nextSequence } from "../counter/counter.model";
import { Package } from "../package/package.model";
import { findRouterWithSecret } from "../router/router.service";
import { assertPlanLimit, changeUsage } from "../subscription/planLimit";
import { Zone } from "../zone/zone.model";
import { Customer, CustomerStatus } from "./customer.model";
import { Actor, buildListFilter } from "./customer.service";
import { loadCustomerWithSecret, syncCustomer } from "./customer.sync";

const MAX_IMPORT = 2000;

/* ───────────────────────── Export ───────────────────────── */

const EXPORT_COLUMNS: XlsxColumn[] = [
  { header: "customer_id", key: "customerId", width: 12 },
  { header: "name", key: "name", width: 24 },
  { header: "phone", key: "phone", width: 15 },
  { header: "pppoe_username", key: "username", width: 18 },
  { header: "package", key: "package", width: 18 },
  { header: "zone", key: "zone", width: 16 },
  { header: "monthly_fee", key: "monthlyFee", width: 12, numFmt: "#,##0.00" },
  { header: "discount", key: "discount", width: 10, numFmt: "#,##0.00" },
  { header: "due_amount", key: "dueAmount", width: 12, numFmt: "#,##0.00" },
  { header: "expiry_date", key: "expiryDate", width: 14, numFmt: "dd/mm/yyyy" },
  { header: "status", key: "status", width: 10 },
  { header: "address", key: "address", width: 30 },
  { header: "nid", key: "nid", width: 18 },
  { header: "onu_mac", key: "onuMac", width: 18 },
];

export async function exportCustomers(actor: Actor, query: Record<string, unknown>) {
  const customers = await Customer.find(buildListFilter(actor, query))
    .sort("customerId")
    .limit(20_000)
    .populate({ path: "package", select: "name" })
    .populate({ path: "zone", select: "name" })
    .lean();
  const rows = customers.map((c) => ({
    ...c,
    username: c.pppoe?.username,
    package: (c.package as unknown as { name?: string })?.name,
    zone: (c.zone as unknown as { name?: string } | undefined)?.name,
    onuMac: c.device?.onuMac,
  }));
  return buildXlsx("Customers", EXPORT_COLUMNS, rows);
}

/* ───────────────────────── Excel import ───────────────────────── */

const IMPORT_COLUMNS: XlsxColumn[] = [
  { header: "name", key: "name", width: 24 },
  { header: "phone", key: "phone", width: 15 },
  { header: "pppoe_username", key: "pppoe_username", width: 18 },
  { header: "pppoe_password", key: "pppoe_password", width: 16 },
  { header: "package", key: "package", width: 18 },
  { header: "zone", key: "zone", width: 16 },
  { header: "monthly_fee", key: "monthly_fee", width: 12 },
  { header: "discount", key: "discount", width: 10 },
  { header: "expiry_date", key: "expiry_date", width: 14 },
  { header: "due_amount", key: "due_amount", width: 12 },
  { header: "free", key: "free", width: 8 },
  { header: "address", key: "address", width: 30 },
  { header: "nid", key: "nid", width: 18 },
  { header: "alt_phone", key: "alt_phone", width: 15 },
  { header: "email", key: "email", width: 22 },
  { header: "onu_mac", key: "onu_mac", width: 18 },
  { header: "note", key: "note", width: 30 },
];

export function importTemplate() {
  return buildXlsx("Customers", IMPORT_COLUMNS, [
    {
      name: "Rahim Uddin",
      phone: "01711000001",
      pppoe_username: "rahim",
      pppoe_password: "secret123",
      package: "10 Mbps",
      zone: "Mirpur",
      monthly_fee: 500,
      discount: 0,
      expiry_date: "30/11/2026",
      due_amount: 0,
      free: "no",
      address: "House 1, Road 2",
    },
  ]);
}

/** dd/mm/yyyy, yyyy-mm-dd or an ISO string from an Excel date cell → end of that day in Dhaka. */
export function parseExpiry(v: string | undefined): Date | null | undefined {
  if (!v) return undefined;
  let y: number, m: number, d: number;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else if (ymd) [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T23:59:59+06:00`);
  // reject rollovers like 31/02
  const check = new Date(date.getTime() + 6 * 3600_000);
  return Number.isNaN(date.getTime()) || check.getUTCDate() !== d ? null : date;
}

const num = (v: string | undefined, field: string, errors: string[]) => {
  if (v === undefined || v === "") return undefined;
  const n = Number(v.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) errors.push(`${field} must be a positive number`);
  return n;
};

type RowResult = { row: number; username?: string; errors: string[] };

/**
 * Validate every row; with commit=true also create the valid ones.
 * All-or-nothing per row: a row with any error is skipped.
 */
export async function importCustomersFromExcel(actor: Actor, buffer: Buffer, commit: boolean) {
  const rows = await readXlsx(buffer, MAX_IMPORT + 1);
  if (!rows.length) throw new AppError(400, "The sheet is empty");
  if (rows.length > MAX_IMPORT) throw new AppError(400, `Max ${MAX_IMPORT} rows per import`);

  const [packages, zones, existing] = await Promise.all([
    Package.find({ isActive: true }),
    Zone.find(),
    Customer.find({ deletedAt: null }).select("pppoe.username").lean(),
  ]);
  const pkgByName = new Map(packages.map((p) => [p.name.trim().toLowerCase(), p]));
  const zoneByName = new Map(zones.map((z) => [z.name.trim().toLowerCase(), z]));
  const taken = new Set(existing.map((c) => c.pppoe.username.toLowerCase()));
  const seen = new Set<string>();

  const results: RowResult[] = [];
  const valid: Record<string, unknown>[] = [];

  for (const r of rows) {
    const errors: string[] = [];
    const username = (r.pppoe_username ?? "").trim();
    const name = (r.name ?? "").trim();
    if (name.length < 2) errors.push("name is required");
    if (!/^[A-Za-z0-9._@-]{2,64}$/.test(username)) errors.push("pppoe_username is missing or has invalid characters");
    else if (taken.has(username.toLowerCase())) errors.push(`username "${username}" already exists`);
    else if (seen.has(username.toLowerCase())) errors.push(`username "${username}" appears twice in the file`);
    seen.add(username.toLowerCase());

    const phone = r.phone ? normalizeBdPhone(r.phone) : undefined;
    if (r.phone && !phone) errors.push("phone is not a valid BD mobile number");
    const altPhone = r.alt_phone ? normalizeBdPhone(r.alt_phone) : undefined;
    if (r.alt_phone && !altPhone) errors.push("alt_phone is not a valid BD mobile number");

    const pkg = pkgByName.get((r.package ?? "").trim().toLowerCase());
    if (!pkg) errors.push(`package "${r.package ?? ""}" not found (use the exact package name)`);
    const zone = r.zone ? zoneByName.get(r.zone.trim().toLowerCase()) : undefined;
    if (r.zone && !zone) errors.push(`zone "${r.zone}" not found`);

    const monthlyFee = num(r.monthly_fee, "monthly_fee", errors);
    const discount = num(r.discount, "discount", errors) ?? 0;
    const dueAmount = num(r.due_amount, "due_amount", errors) ?? 0;
    const expiry = parseExpiry(r.expiry_date);
    if (expiry === null) errors.push("expiry_date must be dd/mm/yyyy");
    const isFree = /^(yes|y|true|1)$/i.test(r.free ?? "");
    const password = r.pppoe_password?.trim() || undefined;
    if (password && !/^[\x21-\x7e]{4,64}$/.test(password)) errors.push("pppoe_password must be 4-64 characters without spaces");

    results.push({ row: Number(r.__row), username, errors });
    if (errors.length || !pkg) continue;

    const expiryDate = expiry ?? new Date();
    const status: CustomerStatus = isFree ? "free" : expiryDate > new Date() ? "active" : "expired";
    valid.push({
      name,
      phone,
      altPhone,
      email: r.email || undefined,
      nid: r.nid || undefined,
      address: r.address || undefined,
      zone: zone?._id,
      pppoe: { username, password: encrypt(password ?? Math.random().toString(36).slice(2, 10)) },
      package: pkg._id,
      router: pkg.router,
      monthlyFee: monthlyFee ?? pkg.price,
      discount,
      dueAmount,
      expiryDate,
      status,
      device: r.onu_mac ? { onuMac: r.onu_mac } : undefined,
      note: r.note || undefined,
      syncStatus: "pending",
    });
  }

  const summary = {
    total: rows.length,
    valid: valid.length,
    invalid: results.filter((r) => r.errors.length).length,
    errors: results.filter((r) => r.errors.length),
    created: 0,
  };
  if (!commit || !valid.length) return summary;

  await assertPlanLimit(actor.company, "customers", valid.length);
  const createdIds: string[] = [];
  for (const doc of valid) {
    const c = await Customer.create({ ...doc, customerId: await nextSequence(actor.company, "customer") });
    createdIds.push(c.id);
  }
  await changeUsage(actor.company, "customers", createdIds.length);
  summary.created = createdIds.length;

  // Push to MikroTik without blocking the response; failures are retried by the sync job.
  runInBackground("import:sync", async () => {
    for (const id of createdIds) {
      const c = await loadCustomerWithSecret(id);
      if (c) await syncCustomer(c);
    }
  });
  return summary;
}

/* ───────────────────────── MikroTik import ───────────────────────── */

export async function mikrotikImportPreview(routerId: string) {
  const router = await findRouterWithSecret(routerId);
  const [secrets, existing, packages] = await Promise.all([
    withRouter(router, (d) => d.listSecrets()),
    Customer.find({ deletedAt: null }).select("pppoe.username").lean(),
    Package.find({ router: routerId, isActive: true }).select("name mikrotikProfile price"),
  ]);
  const taken = new Set(existing.map((c) => c.pppoe.username.toLowerCase()));
  const byProfile = new Map(packages.map((p) => [p.mikrotikProfile.toLowerCase(), p]));
  return {
    router: { _id: router.id, name: router.name },
    packages,
    secrets: secrets
      .filter((s) => s.service === "pppoe" || s.service === "any" || !s.service)
      .map((s) => ({
        username: s.name,
        profile: s.profile,
        disabled: s.disabled,
        comment: s.comment,
        hasPassword: Boolean(s.password),
        exists: taken.has(s.name.toLowerCase()),
        suggestedPackage: byProfile.get((s.profile ?? "").toLowerCase())?._id ?? null,
      })),
  };
}

export const mikrotikImportSchema = z.object({
  /** expiry for every imported customer (dd/mm/yyyy or ISO) */
  expiryDate: z.coerce.date(),
  items: z
    .array(
      z.object({
        username: z.string().min(1),
        package: objectId,
        name: z.string().trim().max(100).optional(),
        phone: z.string().trim().optional(),
      }),
    )
    .min(1)
    .max(MAX_IMPORT),
});

/**
 * Create customers for existing router secrets. Passwords are read from the router
 * (the API user needs the "sensitive" policy). Nothing is written back to MikroTik
 * unless the billing status differs from the secret's current state.
 */
export async function importFromMikrotik(actor: Actor, routerId: string, input: z.infer<typeof mikrotikImportSchema>) {
  if (!isValidObjectId(routerId)) throw new AppError(400, "Invalid router id");
  const router = await findRouterWithSecret(routerId);
  const secrets = new Map((await withRouter(router, (d) => d.listSecrets())).map((s) => [s.name, s]));
  const packages = new Map((await Package.find({ router: routerId })).map((p) => [p.id, p]));
  const taken = new Set((await Customer.find({ deletedAt: null }).select("pppoe.username").lean()).map((c) => c.pppoe.username.toLowerCase()));

  const errors: { username: string; error: string }[] = [];
  const toCreate: Record<string, unknown>[] = [];
  const now = new Date();

  for (const item of input.items) {
    const s = secrets.get(item.username);
    const pkg = packages.get(item.package);
    if (!s) errors.push({ username: item.username, error: "Not found on router" });
    else if (!pkg) errors.push({ username: item.username, error: "Package not found for this router" });
    else if (taken.has(item.username.toLowerCase())) errors.push({ username: item.username, error: "Already imported" });
    else if (!s.password) {
      errors.push({ username: item.username, error: "Router did not return the password — give the API user the 'sensitive' policy" });
    } else {
      taken.add(item.username.toLowerCase());
      const phone = item.phone ? (normalizeBdPhone(item.phone) ?? undefined) : undefined;
      const status: CustomerStatus = s.disabled ? "disabled" : input.expiryDate > now ? "active" : "expired";
      // If the router state already matches (and the profile is right) there is nothing to push.
      const matches = !s.disabled === (status === "active") && s.profile === pkg.mikrotikProfile;
      toCreate.push({
        name: item.name || s.comment?.slice(0, 100) || s.name,
        phone,
        pppoe: { username: s.name, password: encrypt(s.password) },
        package: pkg._id,
        router: router._id,
        monthlyFee: pkg.price,
        expiryDate: input.expiryDate,
        status,
        syncStatus: matches ? "synced" : "pending",
        note: `Imported from MikroTik ${router.name}`,
      });
    }
  }

  if (toCreate.length) await assertPlanLimit(actor.company, "customers", toCreate.length);
  const pendingIds: string[] = [];
  for (const doc of toCreate) {
    const c = await Customer.create({ ...doc, customerId: await nextSequence(actor.company, "customer") });
    if (c.syncStatus === "pending") pendingIds.push(c.id);
  }
  if (toCreate.length) await changeUsage(actor.company, "customers", toCreate.length);

  runInBackground("mikrotik-import:sync", async () => {
    for (const id of pendingIds) {
      const c = await loadCustomerWithSecret(id);
      if (c) await syncCustomer(c);
    }
  });
  return { created: toCreate.length, errors };
}
