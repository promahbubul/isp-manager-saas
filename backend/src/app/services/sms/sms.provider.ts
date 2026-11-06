import config from "../../config";

export type SmsSendResult = { ok: boolean; response?: string; error?: string };

export interface SmsProvider {
  readonly name: string;
  send(to: string, message: string): Promise<SmsSendResult>;
}

/** Bangladeshi gateways expect 8801XXXXXXXXX. */
export const toInternational = (phone: string) => (phone.startsWith("880") ? phone : `88${phone}`);

/** Development: print instead of sending. */
class LogProvider implements SmsProvider {
  readonly name = "log";
  async send(to: string, message: string) {
    if (!config.isTest) console.log(`📱 [sms:log] → ${to}: ${message}`);
    return { ok: true, response: "logged" };
  }
}

/**
 * Works with most BD gateways (BulkSMSBD, Alpha SMS, Greenweb, ...), which take a
 * GET/POST URL. Example (check your gateway's docs):
 *   SMS_HTTP_URL=https://bulksmsbd.net/api/smsapi?api_key={apiKey}&type=text&number={to}&senderid={senderId}&message={message}
 *   SMS_SUCCESS_PATTERN="response_code\":\s*202"
 */
class HttpProvider implements SmsProvider {
  readonly name = "http";
  async send(to: string, message: string): Promise<SmsSendResult> {
    const { httpUrl, httpMethod, successPattern, apiKey, senderId } = config.sms;
    if (!httpUrl) return { ok: false, error: "SMS_HTTP_URL is not configured" };
    const values: Record<string, string> = {
      to: toInternational(to),
      message,
      apiKey: apiKey ?? "",
      senderId: senderId ?? "",
    };
    const fill = (tpl: string) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(values[k] ?? ""));
    try {
      const url = fill(httpUrl);
      const res =
        httpMethod === "POST"
          ? await fetch(url.split("?")[0], {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: url.split("?")[1] ?? "",
              signal: AbortSignal.timeout(15_000),
            })
          : await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const body = (await res.text()).slice(0, 1000);
      const ok = res.ok && new RegExp(successPattern).test(body);
      return ok ? { ok, response: body } : { ok, response: body, error: `Gateway rejected (HTTP ${res.status})` };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}

let provider: SmsProvider = config.sms.provider === "http" ? new HttpProvider() : new LogProvider();

export const getSmsProvider = () => provider;

/** Tests swap in a fake provider. */
export function setSmsProvider(p?: SmsProvider) {
  provider = p ?? (config.sms.provider === "http" ? new HttpProvider() : new LogProvider());
}
