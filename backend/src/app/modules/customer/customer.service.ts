import crypto from "crypto";
import { isValidObjectId, Types } from "mongoose";
import { TenantRole } from "../../constants/roles";
import AppError from "../../errors/AppError";
import { withRouter } from "../../services/mikrotik/mikrotik.service";
import { addDays } from "../../utils/duration";
import { decrypt, encrypt } from "../../utils/encryption";
import { paginate } from "../../utils/paginate";
import { nextSequence } from "../counter/counter.model";
import { findPackageOrThrow } from "../package/package.service";
import { MikrotikRouter } from "../router/router.model";
import { Reseller } from "../reseller/reseller.model";
import { assertPlanLimit, changeUsage } from "../subscription/planLimit";
import { sendEventSms } from "../sms/sms.service";
import { Zone } from "../zone/zone.model";
import { Customer, CustomerDoc, CustomerStatus, ICustomer } from "./customer.model";
import { isConnectionEnabled, removeCustomerFromRouter, syncCustomer } from "./customer.sync";
import { CreateCustomerInput, UpdateCustomerInput } from "./customer.validation";

/** reseller = the Reseller id when the staff user is a reseller's login */
export type Actor = { id: string; role: TenantRole; company: string; zones: string[]; reseller?: string };

/**
 * Collectors and technicians assigned to zones only see customers in those zones.
 * A reseller only ever sees their own customers.
 */
export function customerScope(actor: Actor): Record<string, unknown> {
  const scope: Record<string, unknown> = { deletedAt: null };
  if (actor.role === "reseller") scope.reseller = actor.reseller ?? { $in: [] }; // no reseller link → sees nothing
  if ((actor.role === "collector" || actor.role === "technician") && actor.zones.length) {
    scope.zone = { $in: actor.zones };
  }
  return scope;
}

export async function findCustomerOrThrow(actor: Actor, id: string, withSecret = false): Promise<CustomerDoc> {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid customer id");
  const q = Customer.findOne({ _id: id, ...customerScope(actor) });
  if (withSecret) q.select("+pppoe.password");
  const customer = await q;
  if (!customer) throw new AppError(404, "Customer not found");
  return customer;
}

const generatePassword = () => crypto.randomBytes(6).toString("base64url").slice(0, 8);

/** Billing status from expiry, unless staff set a manual status. */
function statusFromExpiry(expiry: Date, isFree: boolean, billingType: "prepaid" | "postpaid" = "prepaid"): CustomerStatus {
  if (isFree) return "free";
  // Postpaid connections are cut by unpaid invoices (invoice job), not by a date.
  if (billingType === "postpaid") return "active";
  return expiry.getTime() > Date.now() ? "active" : "expired";
}

async function assertZone(zoneId?: string | null) {
  if (zoneId && !(await Zone.exists({ _id: zoneId }))) throw new AppError(400, "Zone not found");
}

export const CUSTOMER_SEARCH_FIELDS = ["name", "phone", "customerId", "pppoe.username"];
export const CUSTOMER_FILTER_FIELDS = ["status", "package", "router", "syncStatus", "connectionType"];

/** Scope + zone + "expiring" filter shared by the list and the Excel export. */
export function buildListFilter(actor: Actor, query: Record<string, unknown>): Record<string, unknown> {
  const filter: Record<string, unknown> = customerScope(actor);

  if (typeof query.zone === "string" && isValidObjectId(query.zone)) {
    const allowed = filter.zone as { $in: string[] } | undefined;
    filter.zone = allowed && !allowed.$in.includes(query.zone) ? { $in: [] } : query.zone;
  }

  // ?expiring=3 → active customers whose validity ends within 3 days
  const expiring = Number(query.expiring);
  if (Number.isFinite(expiring) && expiring > 0) {
    filter.status = "active";
    filter.expiryDate = { $gte: new Date(), $lte: addDays(new Date(), expiring) };
  }
  return filter;
}

async function list(actor: Actor, query: Record<string, unknown>) {
  return paginate<ICustomer>(Customer, buildListFilter(actor, query), query, {
    searchFields: CUSTOMER_SEARCH_FIELDS,
    filterFields: CUSTOMER_FILTER_FIELDS,
    populate: [
      { path: "package", select: "name price speedDown" },
      { path: "zone", select: "name" },
    ],
  });
}

async function getById(actor: Actor, id: string) {
  const customer = await findCustomerOrThrow(actor, id);
  await customer.populate([
    { path: "package", select: "name price speedDown speedUp validityDays mikrotikProfile" },
    { path: "zone", select: "name" },
    { path: "router", select: "name host status" },
  ]);
  return customer;
}

/** Resellers always own what they create; ISP staff may assign an active reseller. */
async function resellerFor(actor: Actor, requested?: string | null) {
  if (actor.role === "reseller") {
    if (!actor.reseller) throw new AppError(403, "Your login is not linked to a reseller account");
    return actor.reseller;
  }
  if (!requested) return null;
  const ok = await Reseller.exists({ _id: requested, isActive: true });
  if (!ok) throw new AppError(400, "Reseller not found or inactive");
  return requested;
}

async function create(actor: Actor, input: CreateCustomerInput) {
  await assertPlanLimit(actor.company, "customers");
  const pkg = await findPackageOrThrow(input.package);
  if (!pkg.isActive) throw new AppError(400, "This package is inactive");
  await assertZone(input.zone);
  if (await Customer.exists({ "pppoe.username": input.pppoeUsername, deletedAt: null })) {
    throw new AppError(409, "PPPoE username already exists");
  }

  const { pppoeUsername, pppoePassword, isFree, ...rest } = input;
  const password = pppoePassword ?? generatePassword();
  const expiryDate = input.expiryDate ?? new Date();

  const customer = await Customer.create({
    ...rest,
    customerId: await nextSequence(actor.company, "customer"),
    pppoe: { username: pppoeUsername, password: encrypt(password) },
    router: pkg.router,
    monthlyFee: input.monthlyFee ?? pkg.price,
    expiryDate,
    status: statusFromExpiry(expiryDate, isFree, input.billingType),
    reseller: await resellerFor(actor, input.reseller),
    syncStatus: "pending",
  });
  await changeUsage(actor.company, "customers", 1);

  const sync = await syncCustomer(customer);
  sendEventSms(actor.company, "welcome", customer, { username: pppoeUsername, password, package: pkg.name });
  return {
    customer,
    sync,
    /** shown once so staff can hand it to the customer */
    generatedPassword: pppoePassword ? undefined : password,
  };
}

async function update(actor: Actor, id: string, input: UpdateCustomerInput) {
  const customer = await findCustomerOrThrow(actor, id, true);
  const previous = { router: customer.router, username: customer.pppoe.username };
  const { pppoeUsername, pppoePassword, isFree, package: packageId, reseller, ...rest } = input;

  if (rest.zone !== undefined) await assertZone(rest.zone);
  // A reseller cannot move customers to someone else; ISP staff can (null = back to the ISP).
  if (reseller !== undefined && actor.role !== "reseller") customer.reseller = reseller ? new Types.ObjectId((await resellerFor(actor, reseller)) as string) : null;

  if (pppoeUsername && pppoeUsername !== customer.pppoe.username) {
    const taken = await Customer.exists({ "pppoe.username": pppoeUsername, deletedAt: null, _id: { $ne: id } });
    if (taken) throw new AppError(409, "PPPoE username already exists");
    customer.pppoe.username = pppoeUsername;
  }
  if (pppoePassword) customer.pppoe.password = encrypt(pppoePassword);

  if (packageId && packageId !== String(customer.package)) {
    const pkg = await findPackageOrThrow(packageId);
    if (!pkg.isActive) throw new AppError(400, "This package is inactive");
    customer.package = pkg._id;
    customer.router = pkg.router;
    if (rest.monthlyFee === undefined) customer.monthlyFee = pkg.price;
  }

  customer.set({
    ...rest,
    zone: rest.zone === null ? undefined : (rest.zone ?? customer.zone),
    altPhone: rest.altPhone === null ? undefined : (rest.altPhone ?? customer.altPhone),
    email: rest.email === null ? undefined : (rest.email ?? customer.email),
  });

  // Recompute billing status when expiry or free flag changed (manual "disabled" stays).
  if (isFree === true) customer.status = "free";
  else if (customer.status !== "disabled" && (isFree === false || rest.expiryDate)) {
    customer.status = statusFromExpiry(customer.expiryDate, false, customer.billingType);
  }

  await customer.save();

  const needsSync =
    pppoeUsername !== undefined ||
    pppoePassword !== undefined ||
    packageId !== undefined ||
    isFree !== undefined ||
    rest.expiryDate !== undefined ||
    rest.connectionType !== undefined;
  const sync = needsSync ? await syncCustomer(customer, previous) : undefined;
  return { customer, sync };
}

async function setEnabled(actor: Actor, id: string, enabled: boolean) {
  const customer = await findCustomerOrThrow(actor, id, true);
  if (enabled) {
    if (customer.status !== "disabled") throw new AppError(400, "Customer is not manually disabled");
    customer.status = statusFromExpiry(customer.expiryDate, false, customer.billingType);
  } else {
    if (customer.status === "disabled") throw new AppError(400, "Customer is already disabled");
    customer.status = "disabled";
  }
  await customer.save();
  const sync = await syncCustomer(customer);
  return { customer, sync };
}

async function routerFor(customer: CustomerDoc) {
  const router = await MikrotikRouter.findById(customer.router).select("+password");
  if (!router) throw new AppError(400, "Customer's router not found");
  return router;
}

async function kick(actor: Actor, id: string) {
  const customer = await findCustomerOrThrow(actor, id);
  const router = await routerFor(customer);
  const kicked = await withRouter(router, (d) => d.kick(customer.pppoe.username));
  return { kicked };
}

/** Live data from MikroTik: is the secret there, enabled, and is a session online? */
async function liveStatus(actor: Actor, id: string) {
  const customer = await findCustomerOrThrow(actor, id);
  const router = await routerFor(customer);
  return withRouter(router, async (d) => {
    const [secret, session] = await Promise.all([
      d.findSecret(customer.pppoe.username),
      d.findActive(customer.pppoe.username),
    ]);
    return {
      online: Boolean(session),
      session,
      secret: secret ? { exists: true, disabled: secret.disabled, profile: secret.profile } : { exists: false },
      expectedEnabled: isConnectionEnabled(customer.status),
    };
  });
}

async function resync(actor: Actor, id: string) {
  const customer = await findCustomerOrThrow(actor, id, true);
  const sync = await syncCustomer(customer);
  return { customer, sync };
}

async function credentials(actor: Actor, id: string) {
  const customer = await findCustomerOrThrow(actor, id, true);
  return { username: customer.pppoe.username, password: decrypt(customer.pppoe.password) };
}

/** Customer left: soft delete + remove the PPPoE secret. History (payments) is kept. */
async function remove(actor: Actor, id: string) {
  const customer = await findCustomerOrThrow(actor, id);
  customer.set({ status: "left", deletedAt: new Date() });
  await customer.save();
  await changeUsage(actor.company, "customers", -1);
  return removeCustomerFromRouter(customer);
}

export const CustomerService = {
  list,
  getById,
  create,
  update,
  setEnabled,
  kick,
  liveStatus,
  resync,
  credentials,
  remove,
};
