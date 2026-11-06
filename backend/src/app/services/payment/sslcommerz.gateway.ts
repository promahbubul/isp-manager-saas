import { pgUrl } from "./callbackUrls";
import { GatewayAccount, PaymentGateway } from "./gateway.types";

/**
 * SSLCommerz v4 hosted checkout.
 * Docs: https://developer.sslcommerz.com/doc/v4/
 *  - session:    POST {host}/gwprocess/v4/api.php  (form-encoded)
 *  - validation: GET  {host}/validator/api/validationserverAPI.php?val_id=...
 */
const host = (a: GatewayAccount) => (a.sandbox ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com");

export const sslcommerzGateway: PaymentGateway = {
  id: "sslcommerz",

  async createCheckout(account, input) {
    const c = account.credentials;
    const body = new URLSearchParams({
      store_id: c.storeId,
      store_passwd: c.storePassword,
      total_amount: input.amount.toFixed(2),
      currency: input.currency,
      tran_id: input.tranId,
      success_url: pgUrl("/sslcommerz/return"),
      fail_url: pgUrl("/sslcommerz/return"),
      cancel_url: pgUrl("/sslcommerz/return"),
      ipn_url: pgUrl("/sslcommerz/ipn"),
      cus_name: input.payer.name,
      cus_email: input.payer.email || "noreply@example.com",
      cus_phone: input.payer.phone || "01700000000",
      cus_add1: "Bangladesh",
      cus_city: "Dhaka",
      cus_country: "Bangladesh",
      shipping_method: "NO",
      product_name: input.description.slice(0, 100),
      product_category: "Internet",
      product_profile: "non-physical-goods",
      value_a: input.tranId,
    });
    const res = await fetch(`${host(account)}/gwprocess/v4/api.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, string>;
    if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
      throw new Error(`SSLCommerz: ${data.failedreason || data.status || `HTTP ${res.status}`}`);
    }
    return { redirectUrl: data.GatewayPageURL, gatewayRef: data.sessionkey };
  },

  async verify(account, attempt, payload) {
    const status = String(payload.status ?? "").toUpperCase();
    if (status === "FAILED") return { status: "failed", reason: payload.error || "Payment failed", raw: payload };
    if (status === "CANCELLED") return { status: "cancelled", raw: payload };
    if (!payload.val_id) return { status: "failed", reason: "Missing val_id", raw: payload };

    const c = account.credentials;
    const qs = new URLSearchParams({ val_id: payload.val_id, store_id: c.storeId, store_passwd: c.storePassword, format: "json" });
    const res = await fetch(`${host(account)}/validator/api/validationserverAPI.php?${qs}`, { signal: AbortSignal.timeout(20_000) });
    const v = (await res.json().catch(() => ({}))) as Record<string, string>;

    const valid = v.status === "VALID" || v.status === "VALIDATED";
    if (!valid) return { status: "failed", reason: `Validation: ${v.status ?? "no response"}`, raw: v };
    if (v.tran_id !== attempt.tranId) return { status: "failed", reason: "Transaction id mismatch", raw: v };
    // Compare in the original currency; tolerate float formatting.
    const paid = Number(v.currency_amount ?? v.amount);
    const currency = v.currency_type ?? v.currency;
    if (currency !== attempt.currency || Math.abs(paid - attempt.amount) > 0.01) {
      return { status: "failed", reason: `Amount mismatch (${paid} ${currency})`, raw: v };
    }
    return { status: "success", gatewayTrxId: v.bank_tran_id || v.val_id, raw: v };
  },
};
