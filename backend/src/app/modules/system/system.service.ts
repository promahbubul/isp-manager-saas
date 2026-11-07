import os from "node:os";
import mongoose from "mongoose";
import config from "../../config";
import { JOBS } from "../../jobs";
import { addDays } from "../../utils/duration";
import { Company } from "../company/company.model";
import { Customer } from "../customer/customer.model";
import { PaymentAttempt } from "../onlinePayment/paymentAttempt.model";
import { MikrotikRouter } from "../router/router.model";
import { SmsLog } from "../sms/sms.model";
import { SupportTicket } from "../support/support.model";
import { JobRun } from "./jobRun.model";

type Check = { ok: boolean; warn?: string };

async function database() {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== 1 || !db) return { ok: false, warn: "Not connected" };
  const t = Date.now();
  await db.admin().ping();
  const pingMs = Date.now() - t;
  const [hello, stats] = await Promise.all([
    db.admin().command({ hello: 1 }) as Promise<{ setName?: string; isWritablePrimary?: boolean; hosts?: string[] }>,
    db.stats() as Promise<{ collections: number; objects: number; dataSize: number; storageSize: number; indexSize: number }>,
  ]);
  const replicaSet = hello.setName ?? null;
  return {
    ok: Boolean(hello.isWritablePrimary),
    // Payments and recharges use transactions, which need a replica set.
    warn: !replicaSet ? "Not a replica set — transactions (recharge, payments) will fail" : pingMs > 200 ? "Slow database ping" : undefined,
    pingMs,
    replicaSet,
    members: hello.hosts?.length ?? 1,
    collections: stats.collections,
    documents: stats.objects,
    dataMB: +(stats.dataSize / 1048576).toFixed(1),
    storageMB: +(stats.storageSize / 1048576).toFixed(1),
    indexMB: +(stats.indexSize / 1048576).toFixed(1),
  };
}

async function jobs(now: Date) {
  const runs = new Map((await JobRun.find().lean()).map((r) => [r.name, r]));
  const list = JOBS.map((j) => {
    const r = runs.get(j.name);
    const stale = !r?.lastFinishedAt || now.getTime() - new Date(r.lastFinishedAt).getTime() > j.maxGapMinutes * 60_000;
    return {
      name: j.name,
      schedule: j.schedule,
      lastFinishedAt: r?.lastFinishedAt ?? null,
      lastDurationMs: r?.lastDurationMs ?? null,
      lastOk: r?.lastOk ?? null,
      lastError: r?.lastOk === false ? r.lastError : undefined,
      lastResult: r?.lastResult,
      runs: r?.runs ?? 0,
      failures: r?.failures ?? 0,
      stale,
    };
  });
  const neverRan = list.every((j) => !j.lastFinishedAt);
  const warn = neverRan
    ? "No job has ever run — is the worker process (RUN_JOBS=true) started?"
    : list.some((j) => j.stale)
      ? "Some jobs are overdue — check the worker process"
      : list.some((j) => j.lastOk === false)
        ? "A job failed on its last run"
        : undefined;
  return { ok: !warn, warn, list };
}

async function routers() {
  const [byStatus, offline] = await Promise.all([
    MikrotikRouter.aggregate<{ _id: string; count: number }>([{ $match: { isActive: true } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    MikrotikRouter.find({ isActive: true, status: "offline" })
      .sort("-lastCheckedAt")
      .limit(20)
      .select("name host lastCheckedAt lastError company")
      .populate("company", "name slug")
      .lean(),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  return { ok: !offline.length, warn: offline.length ? `${counts.offline ?? offline.length} router(s) offline` : undefined, counts, offline };
}

async function customerSync() {
  const [counts, topFailing] = await Promise.all([
    Customer.aggregate<{ _id: string; count: number }>([{ $match: { deletedAt: null, syncStatus: { $ne: "synced" } } }, { $group: { _id: "$syncStatus", count: { $sum: 1 } } }]),
    Customer.aggregate<{ _id: mongoose.Types.ObjectId; failed: number }>([
      { $match: { deletedAt: null, syncStatus: "failed" } },
      { $group: { _id: "$company", failed: { $sum: 1 } } },
      { $sort: { failed: -1 } },
      { $limit: 10 },
    ]),
  ]);
  const companies = await Company.find({ _id: { $in: topFailing.map((t) => t._id) } }).select("name slug").lean();
  const names = new Map(companies.map((c) => [String(c._id), c]));
  const c = Object.fromEntries(counts.map((x) => [x._id, x.count]));
  return {
    ok: !c.failed,
    warn: c.failed ? `${c.failed} customer(s) failed to sync to MikroTik` : undefined,
    pending: c.pending ?? 0,
    failed: c.failed ?? 0,
    topFailing: topFailing.map((t) => ({ company: names.get(String(t._id)) ?? null, failed: t.failed })),
  };
}

async function sms(now: Date) {
  const since = addDays(now, -1);
  const [rows, stuck] = await Promise.all([
    SmsLog.aggregate<{ _id: string; count: number }>([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    SmsLog.countDocuments({ status: "queued", createdAt: { $lt: new Date(now.getTime() - 15 * 60_000) } }),
  ]);
  const c = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  const sent = c.sent ?? 0;
  const failed = c.failed ?? 0;
  const failRate = sent + failed ? failed / (sent + failed) : 0;
  return {
    ok: failRate < 0.1 && !stuck,
    warn: stuck ? `${stuck} SMS stuck in the queue` : failRate >= 0.1 ? `${Math.round(failRate * 100)}% of SMS failed in 24h — check the SMS gateway` : undefined,
    last24h: { sent, failed, queued: c.queued ?? 0 },
    stuck,
    provider: config.sms.provider,
  };
}

async function payments(now: Date) {
  const [pendingReview, stuck, failed24h] = await Promise.all([
    PaymentAttempt.aggregate<{ _id: string; count: number }>([
      { $match: { status: "pending_review" } },
      { $group: { _id: { $cond: [{ $eq: ["$scope", "customer_bill"] }, "isp", "platform"] }, count: { $sum: 1 } } },
    ]),
    // A gateway redirect that never came back (closed tab, failed IPN) after 2 hours.
    PaymentAttempt.countDocuments({ status: "initiated", gateway: { $ne: "manual" }, createdAt: { $lt: new Date(now.getTime() - 2 * 3600_000), $gte: addDays(now, -7) } }),
    PaymentAttempt.countDocuments({ status: "failed", updatedAt: { $gte: addDays(now, -1) } }),
  ]);
  const review = Object.fromEntries(pendingReview.map((r) => [r._id, r.count]));
  return {
    ok: !review.platform,
    warn: review.platform ? `${review.platform} manual payment(s) waiting for your review` : undefined,
    pendingReviewPlatform: review.platform ?? 0,
    pendingReviewIsp: review.isp ?? 0,
    abandoned7d: stuck,
    failed24h,
  };
}

async function support() {
  const open = await SupportTicket.countDocuments({ status: "open" });
  const urgent = await SupportTicket.countDocuments({ status: "open", priority: "urgent" });
  return { ok: !urgent, warn: urgent ? `${urgent} urgent support ticket(s) waiting` : undefined, open, urgent };
}

function process_(): Check & Record<string, unknown> {
  const mem = process.memoryUsage();
  return {
    ok: true,
    node: process.version,
    env: config.env,
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    rssMB: Math.round(mem.rss / 1048576),
    heapUsedMB: Math.round(mem.heapUsed / 1048576),
    host: { load1: +os.loadavg()[0].toFixed(2), cpus: os.cpus().length, freeMemMB: Math.round(os.freemem() / 1048576), totalMemMB: Math.round(os.totalmem() / 1048576) },
  };
}

/** One call for the super admin "System health" page. Each section has ok + optional warn. */
async function health() {
  const now = new Date();
  const safe = async <T extends Check>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (err) {
      return { ok: false, warn: `Check failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  };
  const [db, jobList, routerStats, sync, smsStats, paymentStats, supportStats] = await Promise.all([
    safe(database),
    safe(() => jobs(now)),
    safe(routers),
    safe(customerSync),
    safe(() => sms(now)),
    safe(() => payments(now)),
    safe(support),
  ]);
  const sections = { api: process_(), database: db, jobs: jobList, routers: routerStats, customerSync: sync, sms: smsStats, payments: paymentStats, support: supportStats };
  const warnings = Object.entries(sections)
    .filter(([, s]) => s.warn)
    .map(([key, s]) => ({ section: key, message: s.warn as string, critical: !s.ok && (key === "database" || key === "jobs") }));
  return { checkedAt: now, ok: Object.values(sections).every((s) => s.ok), warnings, ...sections };
}

export const SystemService = { health };
