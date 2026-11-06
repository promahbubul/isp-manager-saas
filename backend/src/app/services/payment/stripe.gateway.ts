import Stripe from "stripe";
import { pgUrl } from "./callbackUrls";
import { GatewayAccount, PaymentGateway } from "./gateway.types";

/**
 * Stripe Checkout (one-time payment). The browser returns to /pg/stripe/return
 * with the session id; we retrieve the session server-side. A webhook
 * (checkout.session.completed) is also handled for reliability.
 */
const clients = new Map<string, Stripe>();
export function stripeClient(a: GatewayAccount): Stripe {
  const key = a.credentials.secretKey;
  let c = clients.get(key);
  if (!c) {
    c = new Stripe(key);
    clients.set(key, c);
  }
  return c;
}

/** Stripe wants the smallest currency unit (BDT and USD both have 2 decimals). */
export const toMinor = (amount: number) => Math.round(amount * 100);

export const stripeGateway: PaymentGateway = {
  id: "stripe",

  async createCheckout(account, input) {
    const session = await stripeClient(account).checkout.sessions.create({
      mode: "payment",
      client_reference_id: input.tranId,
      customer_email: input.payer.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: toMinor(input.amount),
            product_data: { name: input.description.slice(0, 200) },
          },
        },
      ],
      metadata: { tranId: input.tranId },
      success_url: pgUrl(`/stripe/return?tran=${encodeURIComponent(input.tranId)}&session_id={CHECKOUT_SESSION_ID}`),
      cancel_url: pgUrl(`/stripe/return?tran=${encodeURIComponent(input.tranId)}&cancelled=1`),
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { redirectUrl: session.url, gatewayRef: session.id };
  },

  async verify(account, attempt, payload) {
    if (payload.cancelled) return { status: "cancelled", raw: payload };
    const sessionId = payload.session_id || attempt.gatewayRef;
    if (!sessionId) return { status: "failed", reason: "Missing session id", raw: payload };
    const s = await stripeClient(account).checkout.sessions.retrieve(sessionId);
    if (s.metadata?.tranId !== attempt.tranId) return { status: "failed", reason: "Session does not belong to this payment", raw: s.id };
    if (s.payment_status !== "paid") {
      // "unpaid" with an open session means the user is still on Stripe — treat as not completed.
      return { status: s.status === "expired" ? "cancelled" : "failed", reason: `Stripe status: ${s.payment_status}`, raw: s.id };
    }
    if (s.amount_total !== toMinor(attempt.amount) || s.currency !== attempt.currency.toLowerCase()) {
      return { status: "failed", reason: "Amount mismatch", raw: s.id };
    }
    const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
    return { status: "success", gatewayTrxId: pi ?? s.id, raw: { id: s.id, payment_intent: pi } };
  },
};
