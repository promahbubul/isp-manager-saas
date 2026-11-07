import { createHttpProvider, SmsProvider, SmsSendResult } from "./sms.provider";

/**
 * SMS gateways an ISP owner can connect with their own account.
 * Each provider takes the owner's credentials and sends one message per call
 * (bulk sends loop over recipients, so every SMS gets its own log row).
 */
export const SMS_GATEWAYS = ["putulhost", "twilio", "vonage", "plivo", "http"] as const;
export type SmsGatewayId = (typeof SMS_GATEWAYS)[number];

export type GatewayConfig = {
  provider: SmsGatewayId;
  /** secrets, stored encrypted */
  credentials: Record<string, string>;
  /** non-secret settings (sender id, transaction type, URL template...) */
  options: Record<string, string>;
};

/** Field list for the settings form (and server-side validation). */
export const GATEWAY_FIELDS: Record<SmsGatewayId, { credentials: string[]; options: string[]; required: string[] }> = {
  putulhost: { credentials: ["apiKey"], options: ["userName", "senderName", "transactionType"], required: ["userName", "apiKey", "senderName"] },
  twilio: { credentials: ["authToken"], options: ["accountSid", "from"], required: ["accountSid", "authToken", "from"] },
  vonage: { credentials: ["apiSecret"], options: ["apiKey", "from"], required: ["apiKey", "apiSecret", "from"] },
  plivo: { credentials: ["authToken"], options: ["authId", "from"], required: ["authId", "authToken", "from"] },
  http: { credentials: ["apiKey"], options: ["httpUrl", "httpMethod", "successPattern", "senderId"], required: ["httpUrl"] },
};

/** 01XXXXXXXXX → 8801XXXXXXXXX (Bangladesh gateways) / +8801XXXXXXXXX (international). */
const bd880 = (to: string) => (to.startsWith("880") ? to : `88${to}`);
const e164 = (to: string) => `+${bd880(to)}`;

const timeout = () => AbortSignal.timeout(15_000);
const fail = (error: string, response?: string): SmsSendResult => ({ ok: false, error, response });

/**
 * PutulHost "WO SMS" API (smsapi.resellcore.com). Always answers HTTP 200;
 * the real result is statusCode/status in the JSON body.
 * The server's public IP must be whitelisted in the PutulHost panel.
 */
export const PUTULHOST_BASE = "https://smsapi.resellcore.com/api/SmsSending";

function putulhost(c: GatewayConfig): SmsProvider {
  return {
    name: "putulhost",
    async send(to, message) {
      try {
        const res = await fetch(`${PUTULHOST_BASE}/SMS`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            UserName: c.options.userName,
            Apikey: c.credentials.apiKey,
            MobileNumber: bd880(to),
            CampaignId: "null",
            SenderName: c.options.senderName,
            TransactionType: c.options.transactionType === "P" ? "P" : "T",
            Message: message,
          }),
          signal: timeout(),
        });
        const text = (await res.text()).slice(0, 1000);
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(text);
        } catch {
          /* not JSON */
        }
        const get = (k: string) => String(body[k] ?? body[k[0].toUpperCase() + k.slice(1)] ?? "");
        const ok = res.ok && (get("statusCode") === "200" || ["success", "sent", "delivered"].includes(get("status").toLowerCase()));
        return ok ? { ok, response: text } : fail(get("responseResult") || `Gateway rejected (HTTP ${res.status})`, text);
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  };
}

/** Twilio Programmable Messaging. */
function twilio(c: GatewayConfig): SmsProvider {
  return {
    name: "twilio",
    async send(to, message) {
      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.options.accountSid)}/Messages.json`, {
          method: "POST",
          headers: { Authorization: `Basic ${Buffer.from(`${c.options.accountSid}:${c.credentials.authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ To: e164(to), From: c.options.from, Body: message }).toString(),
          signal: timeout(),
        });
        const text = (await res.text()).slice(0, 1000);
        if (res.ok) return { ok: true, response: text };
        let msg = `HTTP ${res.status}`;
        try {
          msg = JSON.parse(text).message ?? msg;
        } catch {
          /* keep status */
        }
        return fail(msg, text);
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  };
}

/** Vonage (Nexmo) SMS API. Non-Latin text must be sent as type=unicode. */
function vonage(c: GatewayConfig): SmsProvider {
  return {
    name: "vonage",
    async send(to, message) {
      try {
        const params = new URLSearchParams({ api_key: c.options.apiKey, api_secret: c.credentials.apiSecret, from: c.options.from, to: bd880(to), text: message });
        if (/[^\x00-\x7f]/.test(message)) params.set("type", "unicode");
        const res = await fetch("https://rest.nexmo.com/sms/json", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
          signal: timeout(),
        });
        const text = (await res.text()).slice(0, 1000);
        let first: { status?: string; "error-text"?: string } = {};
        try {
          first = JSON.parse(text).messages?.[0] ?? {};
        } catch {
          /* not JSON */
        }
        return res.ok && first.status === "0" ? { ok: true, response: text } : fail(first["error-text"] ?? `HTTP ${res.status}`, text);
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  };
}

/** Plivo Messages API. */
function plivo(c: GatewayConfig): SmsProvider {
  return {
    name: "plivo",
    async send(to, message) {
      try {
        const res = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(c.options.authId)}/Message/`, {
          method: "POST",
          headers: { Authorization: `Basic ${Buffer.from(`${c.options.authId}:${c.credentials.authToken}`).toString("base64")}`, "Content-Type": "application/json" },
          body: JSON.stringify({ src: c.options.from, dst: bd880(to), text: message }),
          signal: timeout(),
        });
        const text = (await res.text()).slice(0, 1000);
        if (res.ok) return { ok: true, response: text };
        let msg = `HTTP ${res.status}`;
        try {
          msg = JSON.parse(text).error ?? msg;
        } catch {
          /* keep status */
        }
        return fail(String(msg), text);
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  };
}

export function buildGateway(c: GatewayConfig): SmsProvider {
  switch (c.provider) {
    case "putulhost":
      return putulhost(c);
    case "twilio":
      return twilio(c);
    case "vonage":
      return vonage(c);
    case "plivo":
      return plivo(c);
    default:
      return createHttpProvider(
        {
          httpUrl: c.options.httpUrl,
          httpMethod: c.options.httpMethod === "POST" ? "POST" : "GET",
          successPattern: c.options.successPattern || ".",
          apiKey: c.credentials.apiKey ?? "",
          senderId: c.options.senderId,
        },
        "own-http",
      );
  }
}

/** Remaining balance, where the provider has an API for it. */
export async function gatewayBalance(c: GatewayConfig): Promise<string | null> {
  try {
    if (c.provider === "putulhost") {
      const res = await fetch(`${PUTULHOST_BASE}/balanceCheck`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ UserName: c.options.userName, Apikey: c.credentials.apiKey }),
        signal: timeout(),
      });
      const b = (await res.json()) as { statusCode?: string; responseResult?: string };
      return b.statusCode === "200" ? `৳${b.responseResult}` : (b.responseResult ?? null);
    }
    if (c.provider === "vonage") {
      const res = await fetch(`https://rest.nexmo.com/account/get-balance?api_key=${encodeURIComponent(c.options.apiKey)}&api_secret=${encodeURIComponent(c.credentials.apiSecret)}`, { signal: timeout() });
      const b = (await res.json()) as { value?: number };
      return b.value !== undefined ? `€${b.value.toFixed(2)}` : null;
    }
    if (c.provider === "twilio") {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.options.accountSid)}/Balance.json`, {
        headers: { Authorization: `Basic ${Buffer.from(`${c.options.accountSid}:${c.credentials.authToken}`).toString("base64")}` },
        signal: timeout(),
      });
      const b = (await res.json()) as { balance?: string; currency?: string };
      return b.balance ? `${b.balance} ${b.currency ?? ""}`.trim() : null;
    }
  } catch {
    return null;
  }
  return null;
}
