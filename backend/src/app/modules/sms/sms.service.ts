import { Types } from "mongoose";
import config from "../../config";
import AppError from "../../errors/AppError";
import { countSegments } from "../../services/sms/segments";
import { getSmsProvider } from "../../services/sms/sms.provider";
import { runInBackground } from "../../utils/background";
import { formatDhakaDate } from "../../utils/date";
import { normalizeBdPhone } from "../../utils/phone";
import { Company } from "../company/company.model";
import { CustomerDoc } from "../customer/customer.model";
import { getSettings } from "../setting/setting.model";
import { companyFeatures } from "../subscription/planFeature";
import { ownProviderFor } from "./ownGateway";
import { sendEventWhatsApp } from "./whatsapp";
import { DEFAULT_TEMPLATES, ISmsLog, SMS_EVENTS, SmsEvent, SmsLog, SmsTemplate } from "./sms.model";

type Id = string | Types.ObjectId;

/** Replace {var} placeholders; unknown variables are left as-is so mistakes are visible. */
export function renderTemplate(template: string, vars: Record<string, string | number | undefined>) {
  return template
    .replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined ? m : String(vars[k])))
    .replace(/[ \t]{2,}/g, " ") // an empty link variable must not leave a gap
    .trim();
}

/** Common variables for a customer. */
export function customerVars(c: Pick<CustomerDoc, "name" | "customerId" | "expiryDate" | "dueAmount" | "monthlyFee" | "discount">) {
  return {
    name: c.name,
    customerId: c.customerId,
    expiry: formatDhakaDate(c.expiryDate),
    due: c.dueAmount,
    amount: Math.max(0, c.monthlyFee - c.discount) + c.dueAmount,
  };
}

/** All five templates, creating the defaults on first use. */
export async function getTemplates(company: Id) {
  const existing = await SmsTemplate.find({ company });
  const missing = SMS_EVENTS.filter((e) => !existing.some((t) => t.event === e));
  if (missing.length) {
    await SmsTemplate.insertMany(
      missing.map((event) => ({ company, event, message: DEFAULT_TEMPLATES[event] })),
      { ordered: false },
    ).catch(() => undefined); // a concurrent request may have created them
    return SmsTemplate.find({ company }).sort("event");
  }
  return existing.sort((a, b) => a.event.localeCompare(b.event));
}

type SendInput = {
  to: string;
  message: string;
  event: ISmsLog["event"];
  customer?: Id;
  sentBy?: Id;
};

/**
 * Send one SMS: validate number → reserve credits atomically → call gateway →
 * refund on failure. Never throws; the SmsLog records the outcome.
 */
export async function sendSms(company: Id, input: SendInput) {
  const to = normalizeBdPhone(input.to);
  const seg = countSegments(input.message);
  const base = {
    company,
    to: to ?? input.to,
    message: input.message,
    event: input.event,
    customer: input.customer,
    sentBy: input.sentBy,
    segments: seg.segments,
    encoding: seg.encoding,
  };
  if (!to) return SmsLog.create({ ...base, status: "failed", error: "Invalid mobile number" });

  // The ISP's own gateway: no platform credits involved.
  const own = await ownProviderFor(company);
  if (own) {
    const log = await SmsLog.create({ ...base, status: "queued", provider: own.name, ownGateway: true });
    const result = await own.send(to, input.message);
    log.set({ status: result.ok ? "sent" : "failed", error: result.error, providerResponse: result.response });
    return log.save();
  }

  const reserved = await Company.findOneAndUpdate(
    { _id: company, smsBalance: { $gte: seg.segments } },
    { $inc: { smsBalance: -seg.segments } },
  );
  if (!reserved) return SmsLog.create({ ...base, status: "failed", error: "Insufficient SMS balance" });

  const log = await SmsLog.create({ ...base, status: "queued", provider: getSmsProvider().name });
  const result = await getSmsProvider().send(to, input.message);
  if (!result.ok) {
    await Company.updateOne({ _id: company }, { $inc: { smsBalance: seg.segments } });
  }
  log.set({ status: result.ok ? "sent" : "failed", error: result.error, providerResponse: result.response });
  return log.save();
}

/**
 * Automatic SMS for a billing/ticket event, if enabled in settings.
 * Runs in the background so it never slows down or breaks the main action.
 */
export function sendEventSms(
  company: Id,
  event: SmsEvent,
  customer: Pick<CustomerDoc, "_id" | "phone" | "name" | "customerId" | "expiryDate" | "dueAmount" | "monthlyFee" | "discount">,
  extra: Record<string, string | number | undefined> = {},
) {
  if (!customer.phone) return;
  runInBackground(`sms:${event}`, async () => {
    const settings = await getSettings(company);
    if (!settings.sms?.autoEvents?.[event]) return;
    const templates = await getTemplates(company);
    const tpl = templates.find((t) => t.event === event);
    if (!tpl?.isActive) return;
    const companyDoc = await Company.findById(company).select("name slug");
    // Links only when the ISP's plan has the feature, otherwise they would open a 404 page.
    const features = companyDoc ? await companyFeatures(companyDoc._id) : [];
    const payLink = companyDoc && features.includes("online_payment") ? `${config.appUrl}/pay/${companyDoc.slug}?c=${customer.customerId}` : "";
    const portalLink = companyDoc && features.includes("customer_portal") ? `${config.appUrl}/portal/${companyDoc.slug}` : "";
    const message = renderTemplate(tpl.message, { company: companyDoc?.name, pay_link: payLink, portal_link: portalLink, ...customerVars(customer), ...extra });
    await sendSms(company, { to: customer.phone!, message, event, customer: customer._id });
    await sendEventWhatsApp(company, event, customer.phone!, { company: companyDoc?.name, pay_link: payLink, portal_link: portalLink, ...customerVars(customer), ...extra });
  });
}

/** Up-front balance check for bulk sends. */
export async function assertBalance(company: Id, needed: number) {
  if (await ownProviderFor(company)) return; // own gateway: credits are not used
  const c = await Company.findById(company).select("smsBalance");
  const have = c?.smsBalance ?? 0;
  if (have < needed) {
    throw new AppError(402, `Not enough SMS credits: this send needs ${needed}, you have ${have}.`, { needed, have });
  }
}
