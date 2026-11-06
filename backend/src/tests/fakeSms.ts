import { SmsProvider } from "../app/services/sms/sms.provider";

/** Records messages instead of sending; set `fail = true` to simulate a gateway error. */
export const fakeSms = {
  name: "fake",
  sent: [] as { to: string; message: string }[],
  fail: false,
  async send(to: string, message: string) {
    if (this.fail) return { ok: false, error: "gateway down" };
    this.sent.push({ to, message });
    return { ok: true, response: "ok" };
  },
  reset() {
    this.sent = [];
    this.fail = false;
  },
} satisfies SmsProvider & Record<string, unknown>;
