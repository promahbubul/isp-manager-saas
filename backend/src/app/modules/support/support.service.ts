import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { paginate } from "../../utils/paginate";
import { runWithTenant } from "../../utils/tenantContext";
import { notifyUsers } from "../notification/notification.service";
import { PlatformUser } from "../platformUser/platformUser.model";
import { User } from "../user/user.model";
import { ISupportTicket, SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SupportTicket } from "./support.model";

const text = z.string().trim().min(2, "Write a message").max(5000);

export const createSupportSchema = z.object({
  subject: z.string().trim().min(5).max(200),
  category: z.enum(SUPPORT_CATEGORIES).default("other"),
  priority: z.enum(SUPPORT_PRIORITIES).default("normal"),
  message: text,
});
export const supportMessageSchema = z.object({ text });
export const platformReplySchema = z.object({ text, close: z.boolean().default(false) });
export const supportStatusSchema = z.object({ status: z.enum(["open", "closed"]) });

const newRef = () => `SUP-${randomBytes(4).toString("hex").toUpperCase()}`;

function assertValidId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, "Invalid ticket id");
}

/* ───────────── ISP side (runs inside the tenant context) ───────────── */

type IspActor = { id: string; company: string; impersonatedBy?: string };

async function ispName(actor: IspActor) {
  const user = await User.findById(actor.id).select("name");
  return `${user?.name ?? "ISP"}${actor.impersonatedBy ? " [by platform admin]" : ""}`;
}

async function create(actor: IspActor, input: z.infer<typeof createSupportSchema>) {
  const name = await ispName(actor);
  return SupportTicket.create({
    ref: newRef(),
    subject: input.subject,
    category: input.category,
    priority: input.priority,
    openedBy: actor.id,
    messages: [{ from: "isp", user: actor.id, name, text: input.message }],
  });
}

function listForIsp(query: Record<string, unknown>) {
  return paginate<ISupportTicket>(SupportTicket, {}, query, {
    defaultSort: "-lastMessageAt",
    searchFields: ["subject", "ref"],
    filterFields: ["status"],
    select: "-messages",
  });
}

async function getForIsp(id: string) {
  assertValidId(id);
  const t = await SupportTicket.findById(id);
  if (!t) throw new AppError(404, "Ticket not found");
  return t;
}

async function ispReply(actor: IspActor, id: string, message: string) {
  const t = await getForIsp(id);
  t.messages.push({ from: "isp", user: new Types.ObjectId(actor.id), name: await ispName(actor), text: message, at: new Date() });
  t.status = "open"; // back in the platform's queue (also re-opens a closed ticket)
  t.closedAt = undefined;
  t.lastMessageAt = new Date();
  return t.save();
}

async function ispClose(id: string) {
  const t = await getForIsp(id);
  t.status = "closed";
  t.closedAt = new Date();
  return t.save();
}

/* ───────────── Platform side (no tenant context) ───────────── */

async function listForPlatform(query: Record<string, unknown>) {
  const filter: Record<string, unknown> = {};
  if (typeof query.company === "string" && Types.ObjectId.isValid(query.company)) filter.company = query.company;
  const [page, counts] = await Promise.all([
    paginate<ISupportTicket>(SupportTicket, filter, query, {
    defaultSort: "-lastMessageAt",
      searchFields: ["subject", "ref"],
      filterFields: ["status", "priority", "category"],
      select: "-messages",
      populate: [{ path: "company", select: "name slug" }],
    }),
    SupportTicket.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  return { ...page, counts: Object.fromEntries(counts.map((c) => [c._id, c.count])) };
}

async function getForPlatform(id: string) {
  assertValidId(id);
  const t = await SupportTicket.findById(id).populate("company", "name slug phone email status").populate("openedBy", "name phone email role");
  if (!t) throw new AppError(404, "Ticket not found");
  return t;
}

async function platformReply(platformUserId: string, id: string, input: z.infer<typeof platformReplySchema>) {
  assertValidId(id);
  const [t, admin] = await Promise.all([SupportTicket.findById(id), PlatformUser.findById(platformUserId).select("name")]);
  if (!t) throw new AppError(404, "Ticket not found");
  t.messages.push({ from: "platform", platformUser: new Types.ObjectId(platformUserId), name: `${admin?.name ?? "Support"} (Platform support)`, text: input.text, at: new Date() });
  t.status = input.close ? "closed" : "answered";
  t.closedAt = input.close ? new Date() : undefined;
  t.lastMessageAt = new Date();
  await t.save();

  // Tell whoever opened it, plus anyone else from the ISP who wrote in the thread.
  const ispUsers = t.messages.filter((m) => m.from === "isp" && m.user).map((m) => m.user!);
  const company = String(t.company);
  await runWithTenant(company, () =>
    notifyUsers(company, [t.openedBy, ...ispUsers], {
      title: `Platform support replied: ${t.subject}`,
      body: input.text.slice(0, 140),
      link: `/dashboard/support/${t.id}`,
    }),
  );
  return t;
}

async function setStatus(id: string, status: "open" | "closed") {
  assertValidId(id);
  const t = await SupportTicket.findById(id);
  if (!t) throw new AppError(404, "Ticket not found");
  t.status = status;
  t.closedAt = status === "closed" ? new Date() : undefined;
  return t.save();
}

export const SupportService = { create, listForIsp, getForIsp, ispReply, ispClose, listForPlatform, getForPlatform, platformReply, setStatus };
