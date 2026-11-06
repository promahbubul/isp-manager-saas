import { pgUrl } from "./callbackUrls";
import { GatewayAccount, PaymentGateway } from "./gateway.types";

/**
 * bKash Tokenized Checkout (v1.2.0-beta).
 * Docs: https://developer.bka.sh/docs/tokenized-checkout-overview
 *  grant  → POST /token/grant      (username/password headers, app_key/app_secret body)
 *  create → POST /create           → bkashURL (redirect user), paymentID
 *  user returns to callbackURL?paymentID=..&status=success|failure|cancel
 *  execute→ POST /execute          → transactionStatus "Completed", trxID
 */
const base = (a: GatewayAccount) =>
  a.sandbox
    ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout"
    : "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout";

type Json = Record<string, string | undefined>;

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<Json> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return (await res.json().catch(() => ({ statusMessage: `HTTP ${res.status}` }))) as Json;
}

// id_token is valid for 1 hour; cache per app key.
const tokens = new Map<string, { token: string; expires: number }>();

async function grantToken(a: GatewayAccount): Promise<string> {
  const c = a.credentials;
  const key = `${a.sandbox}:${c.appKey}`;
  const cached = tokens.get(key);
  if (cached && cached.expires > Date.now()) return cached.token;
  const data = await post(`${base(a)}/token/grant`, { username: c.username, password: c.password }, { app_key: c.appKey, app_secret: c.appSecret });
  if (!data.id_token) throw new Error(`bKash token: ${data.statusMessage ?? data.msg ?? "failed"}`);
  tokens.set(key, { token: data.id_token, expires: Date.now() + 50 * 60_000 });
  return data.id_token;
}

const authHeaders = async (a: GatewayAccount) => ({ Authorization: await grantToken(a), "X-APP-Key": a.credentials.appKey });

export const bkashGateway: PaymentGateway = {
  id: "bkash",

  async createCheckout(account, input) {
    if (input.currency !== "BDT") throw new Error("bKash only accepts BDT");
    const data = await post(`${base(account)}/create`, await authHeaders(account), {
      mode: "0011",
      payerReference: input.payer.phone || input.tranId,
      callbackURL: pgUrl(`/bkash/callback?tran=${encodeURIComponent(input.tranId)}`),
      amount: input.amount.toFixed(2),
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: input.tranId,
    });
    if (data.statusCode !== "0000" || !data.bkashURL) throw new Error(`bKash: ${data.statusMessage ?? "create payment failed"}`);
    return { redirectUrl: data.bkashURL, gatewayRef: data.paymentID };
  },

  async verify(account, attempt, payload) {
    const status = String(payload.status ?? "").toLowerCase();
    if (status === "cancel") return { status: "cancelled", raw: payload };
    if (status === "failure") return { status: "failed", reason: "Payment failed", raw: payload };
    const paymentID = payload.paymentID || attempt.gatewayRef;
    if (!paymentID) return { status: "failed", reason: "Missing paymentID", raw: payload };

    const headers = await authHeaders(account);
    let data = await post(`${base(account)}/execute`, headers, { paymentID });
    // Execute can time out or report "already completed"; the status API is authoritative.
    if (data.transactionStatus !== "Completed") {
      data = await post(`${base(account)}/payment/status`, headers, { paymentID });
    }
    if (data.transactionStatus !== "Completed") {
      return { status: "failed", reason: data.statusMessage ?? `Status ${data.transactionStatus ?? "unknown"}`, raw: data };
    }
    if (data.merchantInvoiceNumber && data.merchantInvoiceNumber !== attempt.tranId) {
      return { status: "failed", reason: "Invoice mismatch", raw: data };
    }
    if (Math.abs(Number(data.amount) - attempt.amount) > 0.01) {
      return { status: "failed", reason: `Amount mismatch (${data.amount})`, raw: data };
    }
    return { status: "success", gatewayTrxId: data.trxID, raw: data };
  },
};
