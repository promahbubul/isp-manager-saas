import { isValidObjectId } from "mongoose";
import { z } from "zod";
import AppError from "../../errors/AppError";
import { paginate } from "../../utils/paginate";
import { objectId, optionalText } from "../../utils/zod";
import { nextSequence } from "../counter/counter.model";
import { Customer } from "../customer/customer.model";
import { Actor, customerScope } from "../customer/customer.service";
import { notifyRoles, notifyUsers } from "../notification/notification.service";
import { sendEventSms } from "../sms/sms.service";
import { User } from "../user/user.model";
import { ITicket, Ticket, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, TicketDoc, TicketStatus } from "./ticket.model";

export const createTicketSchema = z.object({
  customer: objectId.optional(),
  category: z.enum(TICKET_CATEGORIES).default("other"),
  subject: z.string().trim().min(3).max(200),
  description: optionalText(2000),
  priority: z.enum(TICKET_PRIORITIES).default("medium"),
  source: z.enum(["office", "phone"]).default("office"),
  assignedTo: objectId.optional(),
});

// Built without .default(): zod keeps defaults inside .partial(), which would reset
// category/priority whenever only the subject is edited.
export const updateTicketSchema = z
  .object({
    category: z.enum(TICKET_CATEGORIES),
    subject: z.string().trim().min(3).max(200),
    description: optionalText(2000),
    priority: z.enum(TICKET_PRIORITIES),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update");

export const assignSchema = z.object({ assignedTo: objectId.nullable() });
export const statusSchema = z.object({ status: z.enum(TICKET_STATUSES), note: optionalText(500) });
export const commentSchema = z.object({ text: z.string().trim().min(1).max(2000) });

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  solved: "Solved",
  closed: "Closed",
};

/** Technicians see tickets assigned to them plus unassigned ones. */
function ticketScope(actor: Actor): Record<string, unknown> {
  return actor.role === "technician" ? { $or: [{ assignedTo: actor.id }, { assignedTo: null }] } : {};
}

async function findOrThrow(actor: Actor, id: string): Promise<TicketDoc> {
  if (!isValidObjectId(id)) throw new AppError(400, "Invalid ticket id");
  const ticket = await Ticket.findOne({ _id: id, ...ticketScope(actor) });
  if (!ticket) throw new AppError(404, "Ticket not found");
  return ticket;
}

async function assertAssignee(userId: string) {
  const u = await User.findOne({ _id: userId, isActive: true }).select("_id");
  if (!u) throw new AppError(400, "Assignee not found or inactive");
}

async function list(actor: Actor, query: Record<string, unknown>) {
  const filter: Record<string, unknown> = { ...ticketScope(actor) };
  if (typeof query.customer === "string" && isValidObjectId(query.customer)) filter.customer = query.customer;
  if (query.assignedTo === "me") filter.assignedTo = actor.id;
  else if (query.assignedTo === "none") filter.assignedTo = null;
  else if (typeof query.assignedTo === "string" && isValidObjectId(query.assignedTo)) filter.assignedTo = query.assignedTo;
  // "active" = open + in_progress
  if (query.status === "active") filter.status = { $in: ["open", "in_progress"] };
  else if (query.status === "overdue") {
    filter.status = { $in: ["open", "in_progress"] };
    filter.dueBy = { $lt: new Date() }; // SLA missed
  }
  else if (typeof query.status === "string" && (TICKET_STATUSES as readonly string[]).includes(query.status)) {
    filter.status = query.status;
  }

  return paginate<ITicket>(Ticket, filter, query, {
    searchFields: ["ticketNo", "subject"],
    filterFields: ["priority", "category"],
    select: "-comments",
    populate: [
      { path: "customer", select: "name customerId phone" },
      { path: "assignedTo", select: "name" },
    ],
  });
}

async function getById(actor: Actor, id: string) {
  const ticket = await findOrThrow(actor, id);
  await ticket.populate([
    { path: "customer", select: "name customerId phone address zone pppoe.username" },
    { path: "assignedTo", select: "name role" },
    { path: "createdBy", select: "name" },
    { path: "comments.by", select: "name" },
  ]);
  return ticket;
}

async function create(actor: Actor, input: z.infer<typeof createTicketSchema>) {
  if (input.customer) {
    const ok = await Customer.exists({ _id: input.customer, ...customerScope(actor) });
    if (!ok) throw new AppError(400, "Customer not found");
  }
  if (input.assignedTo) await assertAssignee(input.assignedTo);

  const ticket = await Ticket.create({
    ...input,
    ticketNo: await nextSequence(actor.company, "ticket"),
    createdBy: actor.id,
    comments: [{ by: actor.id, text: "Ticket created", system: true }],
  });

  const link = `/dashboard/tickets/${ticket.id}`;
  if (input.assignedTo) {
    await notifyUsers(actor.company, [input.assignedTo], { title: `Ticket ${ticket.ticketNo} assigned to you`, body: ticket.subject, link }, actor.id);
  } else {
    await notifyRoles(actor.company, ["owner", "admin", "manager"], { title: `New ticket ${ticket.ticketNo}`, body: ticket.subject, link }, actor.id);
  }
  return ticket;
}

async function update(actor: Actor, id: string, input: z.infer<typeof updateTicketSchema>) {
  const ticket = await findOrThrow(actor, id);
  ticket.set(input);
  return ticket.save();
}

async function assign(actor: Actor, id: string, assignedTo: string | null) {
  const ticket = await findOrThrow(actor, id);
  if (assignedTo) await assertAssignee(assignedTo);
  ticket.assignedTo = assignedTo as never;
  const name = assignedTo ? (await User.findById(assignedTo).select("name"))?.name : null;
  ticket.comments.push({ by: actor.id as never, text: name ? `Assigned to ${name}` : "Unassigned", at: new Date(), system: true });
  if (ticket.status === "open" && assignedTo) ticket.status = "in_progress";
  await ticket.save();
  if (assignedTo) {
    await notifyUsers(
      actor.company,
      [assignedTo],
      { title: `Ticket ${ticket.ticketNo} assigned to you`, body: ticket.subject, link: `/dashboard/tickets/${ticket.id}` },
      actor.id,
    );
  }
  return ticket;
}

async function setStatus(actor: Actor, id: string, status: TicketStatus, note?: string) {
  const ticket = await findOrThrow(actor, id);
  if (ticket.status === status) throw new AppError(400, `Ticket is already ${STATUS_LABEL[status].toLowerCase()}`);
  ticket.status = status;
  ticket.solvedAt = status === "solved" || status === "closed" ? (ticket.solvedAt ?? new Date()) : undefined;
  ticket.comments.push({
    by: actor.id as never,
    text: `Status → ${STATUS_LABEL[status]}${note ? `: ${note}` : ""}`,
    at: new Date(),
    system: true,
  });
  await ticket.save();

  if (status === "solved" && ticket.customer) {
    const customer = await Customer.findById(ticket.customer);
    if (customer) sendEventSms(actor.company, "ticket_update", customer, { ticketNo: ticket.ticketNo, status: STATUS_LABEL[status] });
  }
  if (ticket.createdBy && String(ticket.createdBy) !== actor.id) {
    await notifyUsers(actor.company, [ticket.createdBy], {
      title: `Ticket ${ticket.ticketNo}: ${STATUS_LABEL[status]}`,
      body: ticket.subject,
      link: `/dashboard/tickets/${ticket.id}`,
    });
  }
  return ticket;
}

async function comment(actor: Actor, id: string, text: string) {
  const ticket = await findOrThrow(actor, id);
  ticket.comments.push({ by: actor.id as never, text, at: new Date() });
  await ticket.save();
  const others = [ticket.assignedTo, ticket.createdBy].filter(Boolean) as never[];
  await notifyUsers(actor.company, others, { title: `New comment on ${ticket.ticketNo}`, body: text.slice(0, 200), link: `/dashboard/tickets/${ticket.id}` }, actor.id);
  return getById(actor, id);
}

/** Open/in-progress counts for the dashboard badge. */
async function counts(actor: Actor) {
  const scope = ticketScope(actor);
  const [open, inProgress, mine, overdue] = await Promise.all([
    Ticket.countDocuments({ ...scope, status: "open" }),
    Ticket.countDocuments({ ...scope, status: "in_progress" }),
    Ticket.countDocuments({ assignedTo: actor.id, status: { $in: ["open", "in_progress"] } }),
    Ticket.countDocuments({ ...scope, status: { $in: ["open", "in_progress"] }, dueBy: { $lt: new Date() } }),
  ]);
  return { open, inProgress, mine, overdue };
}

export const TicketService = { list, getById, create, update, assign, setStatus, comment, counts };
