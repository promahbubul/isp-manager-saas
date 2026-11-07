import { Types } from "mongoose";
import { withRouter } from "../../services/mikrotik/mikrotik.service";
import { ActiveSession } from "../../services/mikrotik/router.driver";
import { parseDay } from "../../utils/date";
import { addDays } from "../../utils/duration";
import { paginate } from "../../utils/paginate";
import { runWithTenant } from "../../utils/tenantContext";
import { Company } from "../company/company.model";
import { Customer } from "../customer/customer.model";
import { MikrotikRouter } from "../router/router.model";
import { companyFeatures } from "../subscription/planFeature";
import { IIpSession, IpSession } from "./iplog.model";

/** RouterOS uptime "1w2d3h4m5s" → milliseconds. */
export function parseUptime(s?: string): number {
  if (!s) return 0;
  const unit: Record<string, number> = { w: 604_800_000, d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 };
  let ms = 0;
  for (const [, n, u] of s.matchAll(/(\d+)([wdhms])/g)) ms += Number(n) * unit[u];
  return ms;
}

/**
 * Reconcile one router's active sessions with the open log rows.
 * Must run inside the tenant context.
 */
export async function recordRouterSessions(routerId: Types.ObjectId, active: ActiveSession[], now = new Date()) {
  const open = await IpSession.find({ router: routerId, endedAt: null });
  const openByUser = new Map(open.map((s) => [s.username, s]));
  const seen = new Set<string>();
  const customers = await Customer.find({ "pppoe.username": { $in: active.map((a) => a.name) }, deletedAt: null }).select("_id pppoe.username");
  const customerOf = new Map(customers.map((c) => [c.pppoe.username, c._id]));
  let opened = 0;
  let closed = 0;

  for (const a of active) {
    seen.add(a.name);
    const cur = openByUser.get(a.name);
    if (cur && cur.ip === a.address) {
      cur.lastSeenAt = now;
      await cur.save();
      continue;
    }
    if (cur) {
      // reconnected with a new IP between two polls
      cur.endedAt = now;
      await cur.save();
      closed += 1;
    }
    const up = parseUptime(a.uptime);
    await IpSession.create({
      router: routerId,
      customer: customerOf.get(a.name),
      username: a.name,
      ip: a.address,
      mac: a.callerId,
      startedAt: up ? new Date(now.getTime() - up) : now,
      lastSeenAt: now,
    });
    opened += 1;
  }
  for (const s of open) {
    if (seen.has(s.username)) continue;
    s.endedAt = s.lastSeenAt; // ended some time after the last poll that saw it
    await s.save();
    closed += 1;
  }
  return { opened, closed };
}

/** Worker job: poll every active router of every ISP whose plan has the IP log. */
export async function pollIpSessions(now = new Date()) {
  const companies = await Company.find({ status: { $in: ["trial", "active", "past_due"] }, deletedAt: null }).select("_id");
  const result = { companies: 0, routers: 0, failed: 0, opened: 0, closed: 0 };
  for (const c of companies) {
    if (!(await companyFeatures(c._id)).includes("ip_log")) continue;
    result.companies += 1;
    await runWithTenant(c.id, async () => {
      // RADIUS routers report sessions themselves through accounting
      const routers = await MikrotikRouter.find({ isActive: true, authMode: { $ne: "radius" } }).select("+password");
      for (const r of routers) {
        try {
          const active = await withRouter(r, (d) => d.listActive());
          const x = await recordRouterSessions(r._id, active, now);
          result.routers += 1;
          result.opened += x.opened;
          result.closed += x.closed;
        } catch {
          result.failed += 1; // unreachable router: open sessions stay open until it answers again
        }
      }
    });
  }
  return result;
}

/** Sessions overlapping [from, to); search by username, IP or MAC. */
export function sessionFilter(query: Record<string, unknown>) {
  const from = parseDay(query.from) ?? addDays(new Date(), -1);
  const toDay = parseDay(query.to);
  const to = toDay ? addDays(toDay, 1) : new Date();
  const filter: Record<string, unknown> = { startedAt: { $lt: to }, $or: [{ endedAt: null }, { endedAt: { $gte: from } }] };
  const q = typeof query.q === "string" ? query.q.trim() : "";
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$and = [{ $or: [{ username: rx }, { ip: rx }, { mac: rx }] }];
  }
  if (typeof query.router === "string" && Types.ObjectId.isValid(query.router)) filter.router = query.router;
  return filter;
}

export function listSessions(query: Record<string, unknown>) {
  return paginate<IIpSession>(IpSession, sessionFilter(query), query, {
    defaultSort: "-startedAt",
    maxLimit: 200,
    populate: [
      { path: "customer", select: "name customerId phone nid address" },
      { path: "router", select: "name" },
    ],
  });
}

export async function exportRows(query: Record<string, unknown>) {
  const rows = await IpSession.find(sessionFilter(query))
    .sort("startedAt")
    .limit(100_000)
    .populate<{ customer: { name: string; customerId: string; phone?: string; nid?: string; address?: string } | null }>("customer", "name customerId phone nid address")
    .populate<{ router: { name: string } | null }>("router", "name")
    .lean();
  return rows.map((r) => ({
    username: r.username,
    customerId: r.customer?.customerId ?? "",
    name: r.customer?.name ?? "",
    phone: r.customer?.phone ?? "",
    nid: r.customer?.nid ?? "",
    address: r.customer?.address ?? "",
    ip: r.ip ?? "",
    mac: r.mac ?? "",
    router: r.router?.name ?? "",
    startedAt: r.startedAt,
    endedAt: r.endedAt ?? "online",
  }));
}
