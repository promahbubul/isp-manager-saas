import nodemailer from "nodemailer";
import config from "../../config";
import { PlatformSetting } from "../../modules/billing/billing.model";
import { decrypt } from "../../utils/encryption";

export type EmailMessage = { to: string; subject: string; html: string; text?: string };
type Sender = (m: EmailMessage & { from: string }) => Promise<void>;

let override: Sender | null = null;
/** Tests capture emails instead of sending. */
export function setEmailSender(s: Sender | null) {
  override = s;
}

/**
 * Platform email (SMTP set by the super admin in Settings). Never throws: email is
 * a nice-to-have notification, it must not break the action that triggered it.
 */
export async function sendEmail(m: EmailMessage): Promise<{ ok: boolean; error?: string }> {
  try {
    const s = await PlatformSetting.findById("global").select("+smtp.pass");
    const smtp = s?.smtp;
    if (!override && (!smtp?.host || !smtp.enabled)) return { ok: false, error: "SMTP is not configured" };
    const from = smtp?.from || `ISP Manager <no-reply@${new URL(config.appUrl).hostname}>`;
    if (override) {
      await override({ ...m, from });
      return { ok: true };
    }
    const transport = nodemailer.createTransport({
      host: smtp!.host,
      port: smtp!.port ?? 587,
      secure: smtp!.port === 465,
      auth: smtp!.user ? { user: smtp!.user, pass: smtp!.pass ? decrypt(smtp!.pass) : "" } : undefined,
      connectionTimeout: 15_000,
    });
    await transport.sendMail({ from, to: m.to, subject: m.subject, html: m.html, text: m.text });
    return { ok: true };
  } catch (err) {
    console.error("[email]", (err as Error).message);
    return { ok: false, error: (err as Error).message };
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Simple, readable HTML wrapper used by every platform email. */
export function emailLayout(title: string, rows: [string, string][], footer?: { text: string; url: string }) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f1f5f9;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:8px;padding:24px">
<h2 style="margin:0 0 16px;color:#581c87">${esc(title)}</h2>
<table style="width:100%;border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b">${esc(k)}</td><td style="padding:6px 0;text-align:right;font-weight:bold">${esc(v)}</td></tr>`).join("")}</table>
${footer ? `<p style="margin-top:20px"><a href="${esc(footer.url)}" style="background:#7e22ce;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${esc(footer.text)}</a></p>` : ""}
</div></body></html>`;
}
