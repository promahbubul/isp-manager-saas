import crypto from "crypto";
import { Types } from "mongoose";
import { z } from "zod";
import config from "../../config";
import AppError from "../../errors/AppError";
import { signPortalToken } from "../../utils/jwt";
import { decrypt, encrypt } from "../../utils/encryption";
import { syncCustomer } from "../customer/customer.sync";
import { normalizeBdPhone } from "../../utils/phone";
import { optionalText } from "../../utils/zod";
import { generateOtp, hashOtp, Otp } from "../auth/otp.model";
import { Company } from "../company/company.model";
import { nextSequence } from "../counter/counter.model";
import { Customer } from "../customer/customer.model";
import { notifyRoles, notifyUsers } from "../notification/notification.service";
import { Payment } from "../payment/payment.model";
import { Package } from "../package/package.model";
import { MikrotikRouter } from "../router/router.model";
import { withRouter } from "../../services/mikrotik/mikrotik.service";
import { notifyNewRequest, PackageRequest } from "./packageRequest";
import { sendSms } from "../sms/sms.service";
import { companyFeatures } from "../subscription/planFeature";
import { Ticket, TICKET_CATEGORIES } from "../ticket/ticket.model";

/**
 * Customer self-care portal: an ISP's customer logs in with an SMS code sent to the
 * mobile number registered with the ISP. One number may have several connections
 * (family, shop + home), so a session covers every connection with that number.
 */

const CODE_TTL_MS = 5 * 60_000;
const RESEND_AFTER_MS = 60_000;
const MAX_ATTEMPTS = 5;

const phoneField = z.string().trim().transform((v, ctx) => {
  const p = normalizeBdPhone(v);
  if (!p) ctx.addIssue({ code: "custom", message: "Enter a valid mobile number" });
  return p ?? "";
});
export const otpRequestSchema = z.object({ phone: phoneField });
export const otpVerifySchema = z.object({ phone: phoneField, code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });
export const portalTicketSchema = z.object({
  account: z.string().trim().refine((v) => Types.ObjectId.isValid(v), "Choose a connection"),
  category: z.enum(TICKET_CATEGORIES).default("other"),
  subject: z.string().trim().min(3).max(200),
  description: optionalText(2000),
});
export const portalCommentSchema = z.object({ text: z.string().trim().min(1).max(2000) });

const ACTIVE = { deletedAt: null, status: { $ne: "left" as const } };

/** ISP by slug, only if its plan includes the portal and the account is usable. */
async function portalCompany(slug: string) {
  const company = await Company.findOne({ slug: slug.toLowerCase(), deletedAt: null, status: { $ne: "archived" } }).select("name slug logo phone address portalTheme");
  if (!company) throw new AppError(404, "ISP not found");
  const features = await companyFeatures(company._id);
  if (!features.includes("customer_portal")) throw new AppError(404, "This ISP has not enabled the customer portal");
  return { company, features };
}

async function info(slug: string) {
  const { company, features } = await portalCompany(slug);
  return {
    name: company.name,
    slug: company.slug,
    logo: company.logo,
    phone: company.phone,
    address: company.address,
    primaryColor: company.portalTheme?.primaryColor,
    onlinePayment: features.includes("online_payment"),
    tickets: features.includes("ticket"),
    whiteLabel: features.includes("white_label"),
  };
}

const mask = (phone: string) => `${phone.slice(0, 3)}*****${phone.slice(-3)}`;

/**
 * Sends the code from the ISP's own SMS balance. Unknown numbers get the same answer,
 * so the endpoint does not reveal who is a customer.
 */
async function requestOtp(slug: string, phone: string) {
  const { company } = await portalCompany(slug);
  const generic = { message: "If this number is registered, a 6-digit code has been sent by SMS.", sentTo: mask(phone) };
  if (!(await Customer.exists({ company: company._id, phone, ...ACTIVE }))) return generic;

  const existing = await Otp.findOne({ phone, purpose: "portal_login", company: company._id });
  if (existing && Date.now() - existing.lastSentAt.getTime() < RESEND_AFTER_MS) {
    throw new AppError(429, "Please wait a minute before requesting another code");
  }
  const code = generateOtp();
  await Otp.findOneAndUpdate(
    { phone, purpose: "portal_login", company: company._id },
    { $set: { codeHash: hashOtp(`${company.id}:${phone}`, code), attempts: 0, expiresAt: new Date(Date.now() + CODE_TTL_MS), lastSentAt: new Date() } },
    { upsert: true },
  );
  const log = await sendSms(company._id, { to: phone, message: `${company.name}: your login code is ${code}. Valid for 5 minutes. Do not share it.`, event: "otp" });
  if (log.status !== "sent") {
    // Let them try again right away instead of waiting a minute for an SMS that never comes.
    await Otp.deleteOne({ phone, purpose: "portal_login", company: company._id });
    throw new AppError(503, `Could not send the SMS right now. Please call ${company.name}${company.phone ? ` at ${company.phone}` : ""}.`);
  }
  return generic;
}

async function verifyOtp(slug: string, phone: string, code: string) {
  const { company } = await portalCompany(slug);
  const otp = await Otp.findOne({ phone, purpose: "portal_login", company: company._id });
  if (!otp || otp.expiresAt < new Date()) throw new AppError(400, "The code is invalid or has expired");
  if (otp.attempts >= MAX_ATTEMPTS) throw new AppError(429, "Too many wrong codes. Request a new one.");
  const ok = crypto.timingSafeEqual(Buffer.from(otp.codeHash), Buffer.from(hashOtp(`${company.id}:${phone}`, code)));
  if (!ok) {
    await Otp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    throw new AppError(400, "The code is invalid or has expired");
  }
  await Otp.deleteOne({ _id: otp._id });
  if (!(await Customer.exists({ company: company._id, phone, ...ACTIVE }))) throw new AppError(400, "No connection found for this number");
  return { accessToken: signPortalToken(phone, company.id), expiresInDays: 7 };
}

/* ───────────── logged-in customer (inside the tenant context) ───────────── */

type Session = { phone: string; company: string };

/**
 * Sessions from an SMS code cover every connection with that mobile number;
 * sessions from a PPPoE login ("c:<customer id>") cover only that connection.
 */
const who = (s: Session): Record<string, unknown> => (s.phone.startsWith("c:") ? { _id: s.phone.slice(2) } : { phone: s.phone });

function accounts(s: Session) {
  return Customer.find({ ...who(s), ...ACTIVE })
    .select("customerId name phone altPhone email connectionType pppoe.username package monthlyFee discount expiryDate dueAmount balance status address zone")
    .populate("package", "name speedDown speedUp price validityDays")
    .populate("zone", "name")
    .sort("customerId");
}

async function me(s: Session) {
  const [company, list, features] = await Promise.all([
    Company.findById(s.company).select("name slug logo phone address portalTheme"),
    accounts(s),
    companyFeatures(s.company),
  ]);
  return {
    phone: s.phone.startsWith("c:") ? null : s.phone,
    company: company && {
      name: company.name,
      slug: company.slug,
      logo: company.logo,
      phone: company.phone,
      address: company.address,
      primaryColor: company.portalTheme?.primaryColor,
    },
    features: { onlinePayment: features.includes("online_payment"), tickets: features.includes("ticket"), whiteLabel: features.includes("white_label") },
    payUrl: company && features.includes("online_payment") ? `${config.appUrl}/pay/${company.slug}` : null,
    accounts: list,
  };
}

/** The connection must belong to this mobile number. */
async function ownAccount(s: Session, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, "Invalid connection");
  // $and: both conditions on _id must hold (a PPPoE session must not reach other connections)
  const c = await Customer.findOne({ $and: [who(s), { _id: id }], ...ACTIVE }).select("_id name customerId phone");
  if (!c) throw new AppError(404, "Connection not found");
  return c;
}

async function payments(s: Session, accountId: string) {
  const c = await ownAccount(s, accountId);
  return Payment.find({ customer: c._id, status: "success" })
    .sort("-createdAt")
    .limit(50)
    .select("receiptNo type amount months method trxId newExpiry dueAfter source createdAt");
}

async function assertTickets(s: Session) {
  if (!(await companyFeatures(s.company)).includes("ticket")) throw new AppError(403, "Complaints are not available online for this ISP. Please call them.");
}

async function myCustomerIds(s: Session) {
  return (await Customer.find({ ...who(s), ...ACTIVE }).select("_id")).map((c) => c._id);
}

async function listTickets(s: Session) {
  await assertTickets(s);
  return Ticket.find({ customer: { $in: await myCustomerIds(s) } })
    .sort("-createdAt")
    .limit(50)
    .select("ticketNo subject category status priority customer createdAt solvedAt")
    .populate("customer", "customerId name");
}

async function createTicket(s: Session, input: z.infer<typeof portalTicketSchema>) {
  await assertTickets(s);
  const customer = await ownAccount(s, input.account);
  // One open complaint per connection is enough; stops accidental double submits.
  const open = await Ticket.findOne({ customer: customer._id, status: { $in: ["open", "in_progress"] }, subject: input.subject });
  if (open) throw new AppError(409, `You already have an open complaint about this (${open.ticketNo}).`);
  const ticket = await Ticket.create({
    ticketNo: await nextSequence(s.company, "ticket"),
    customer: customer._id,
    category: input.category,
    subject: input.subject,
    description: input.description,
    priority: input.category === "no_internet" || input.category === "fiber_cut" ? "high" : "medium",
    source: "portal",
    comments: [{ text: "Complaint submitted from the customer portal", system: true }],
  });
  await notifyRoles(s.company, ["owner", "admin", "manager"], {
    title: `New complaint ${ticket.ticketNo} from ${customer.name} (portal)`,
    body: ticket.subject,
    link: `/dashboard/tickets/${ticket.id}`,
  });
  return ticket;
}

/** Customer view: staff names only, no internal assignee details. */
async function getTicket(s: Session, id: string) {
  await assertTickets(s);
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, "Invalid ticket");
  const t = await Ticket.findOne({ _id: id, customer: { $in: await myCustomerIds(s) } })
    .populate("customer", "customerId name")
    .populate("comments.by", "name");
  if (!t) throw new AppError(404, "Complaint not found");
  return t;
}

async function commentTicket(s: Session, id: string, text: string) {
  const t = await getTicket(s, id);
  if (t.status === "closed") throw new AppError(400, "This complaint is closed. Please open a new one.");
  t.comments.push({ text, at: new Date(), fromCustomer: true });
  if (t.status === "solved") t.status = "open"; // customer says it is not fixed
  await t.save();
  const watchers = [t.assignedTo].filter(Boolean);
  if (watchers.length) {
    await notifyUsers(s.company, watchers as Types.ObjectId[], { title: `Customer replied on ${t.ticketNo}`, body: text.slice(0, 200), link: `/dashboard/tickets/${t.id}` });
  } else {
    await notifyRoles(s.company, ["owner", "admin", "manager"], { title: `Customer replied on ${t.ticketNo}`, body: text.slice(0, 200), link: `/dashboard/tickets/${t.id}` });
  }
  return getTicket(s, id);
}

/** Packages a customer can switch to (active, on the same router so no re-cabling). */
async function packages(s: Session, accountId: string) {
  const c = await ownAccount(s, accountId);
  const full = await Customer.findById(c._id).select("router package");
  return Package.find({ isActive: true, router: full!.router }).select("name speedDown speedUp price validityDays").sort("price");
}

async function requestPackageChange(s: Session, accountId: string, input: { package: string; note?: string }) {
  const c = await ownAccount(s, accountId);
  const full = await Customer.findById(c._id).select("router package name");
  if (String(full!.package) === input.package) throw new AppError(400, "You are already on this package");
  const pkg = await Package.findOne({ _id: input.package, isActive: true, router: full!.router });
  if (!pkg) throw new AppError(400, "This package is not available for your connection");
  if (await PackageRequest.exists({ customer: c._id, status: "pending" })) throw new AppError(409, "You already have a pending request. The ISP will contact you.");
  const r = await PackageRequest.create({ customer: c._id, fromPackage: full!.package, toPackage: pkg._id, note: input.note });
  await notifyNewRequest(s.company, full!.name, r.id);
  return r;
}

async function pendingRequests(s: Session) {
  return PackageRequest.find({ customer: { $in: await myCustomerIds(s) }, status: "pending" }).populate("toPackage", "name price");
}

/** Live from the router: online?, IP, uptime and bytes this session. Never throws for router trouble. */
async function live(s: Session, accountId: string) {
  const c = await ownAccount(s, accountId);
  const full = await Customer.findById(c._id).select("router pppoe.username connectionType");
  if (full!.connectionType !== "pppoe") return { supported: false };
  const router = await MikrotikRouter.findById(full!.router).select("+password");
  if (!router) return { supported: false };
  try {
    return await withRouter(router, async (d) => {
      const active = await d.findActive(full!.pppoe.username);
      if (!active) return { supported: true, online: false };
      const traffic = await d.sessionTraffic(full!.pppoe.username).catch(() => null);
      return { supported: true, online: true, ip: active.address, uptime: active.uptime, ...traffic };
    });
  } catch {
    return { supported: true, online: null, error: "Could not reach the network right now" };
  }
}

export const pppoeLoginSchema = z.object({ username: z.string().trim().min(2).max(64), password: z.string().min(1).max(64) });

/** Login with the PPPoE username + password printed on the welcome SMS / router sticker. */
async function pppoeLogin(slug: string, username: string, password: string) {
  const { company } = await portalCompany(slug);
  const c = await Customer.findOne({ company: company._id, "pppoe.username": username, ...ACTIVE }).select("+pppoe.password");
  const fail = new AppError(400, "Wrong username or password");
  if (!c?.pppoe?.password) throw fail;
  const real = Buffer.from(decrypt(c.pppoe.password));
  const given = Buffer.from(password);
  if (real.length !== given.length || !crypto.timingSafeEqual(real, given)) throw fail;
  return { accessToken: signPortalToken(`c:${c.id}`, company.id), expiresInDays: 7 };
}

/** Printable money receipt for one of the customer's own payments. */
async function receipt(s: Session, paymentId: string) {
  if (!Types.ObjectId.isValid(paymentId)) throw new AppError(400, "Invalid receipt");
  const p = await Payment.findOne({ _id: paymentId, customer: { $in: await myCustomerIds(s) }, status: "success" }).populate("customer", "name customerId phone address pppoe.username");
  if (!p) throw new AppError(404, "Receipt not found");
  const company = await Company.findById(s.company).select("name phone email address logo");
  return { ...p.toJSON(), company };
}

export const profileSchema = z.object({ altPhone: z.string().trim().max(20).optional(), email: z.email().trim().toLowerCase().optional().or(z.literal("")), address: optionalText(300) });
export const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "At least 6 characters").max(64).regex(/^[\x21-\x7e]+$/, "No spaces or special characters"),
});

async function updateProfile(s: Session, accountId: string, input: z.infer<typeof profileSchema>) {
  const c = await ownAccount(s, accountId);
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  if (input.altPhone !== undefined) {
    if (input.altPhone === "") unset.altPhone = 1;
    else {
      const p = normalizeBdPhone(input.altPhone);
      if (!p) throw new AppError(400, "Enter a valid mobile number");
      set.altPhone = p;
    }
  }
  if (input.email !== undefined) {
    if (input.email) set.email = input.email;
    else unset.email = 1;
  }
  if (input.address !== undefined) set.address = input.address;
  await Customer.updateOne({ _id: c._id }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  return Customer.findById(c._id).select("name customerId phone altPhone email address");
}

/** New PPPoE password: saved and pushed to the router (the customer must update their WiFi router too). */
async function changePassword(s: Session, accountId: string, input: z.infer<typeof passwordSchema>) {
  const own = await ownAccount(s, accountId);
  const c = await Customer.findById(own._id).select("+pppoe.password");
  if (!c) throw new AppError(404, "Connection not found");
  if (decrypt(c.pppoe.password) !== input.currentPassword) throw new AppError(400, "Current password is wrong");
  c.pppoe.password = encrypt(input.newPassword);
  await c.save();
  const sync = await syncCustomer(c);
  return { sync };
}

export const PortalService = { pppoeLogin, receipt, updateProfile, changePassword, info, requestOtp, verifyOtp, me, payments, listTickets, createTicket, getTicket, commentTicket, packages, requestPackageChange, pendingRequests, live };
