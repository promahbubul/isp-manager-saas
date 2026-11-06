import { Request, Response, Router } from "express";
import Stripe from "stripe";
import config from "../../config";
import { stripeClient } from "../../services/payment/stripe.gateway";
import { getGatewayAccount } from "../paymentGateway/gatewayConfig.service";
import { PaymentAttempt } from "./paymentAttempt.model";
import { accountOwner, resultRedirect, verifyAndComplete } from "./onlinePayment.service";

/**
 * Public endpoints called by payment gateways (browser redirects, IPN, webhooks).
 * Every one re-verifies with the gateway's server before granting anything.
 */
const router = Router();

const str = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? String(v[0] ?? "") : "");
const flat = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, str(v)]));
const failRedirect = (res: Response, reason: string) =>
  res.redirect(303, `${config.appUrl}/payment/result?payment=failed&reason=${encodeURIComponent(reason)}`);

async function finish(res: Response, tranId: string, gateway: "sslcommerz" | "bkash" | "stripe", payload: Record<string, string>) {
  if (!tranId) return failRedirect(res, "Missing transaction");
  try {
    const attempt = await verifyAndComplete(tranId, gateway, payload);
    res.redirect(303, resultRedirect(attempt));
  } catch (err) {
    failRedirect(res, (err as Error).message);
  }
}

// SSLCommerz posts the browser back here for success, fail and cancel.
router.post("/sslcommerz/return", async (req: Request, res: Response) => {
  const body = flat(req.body);
  await finish(res, body.tran_id || body.value_a, "sslcommerz", body);
});

// Server-to-server notification (the reliable path if the user closes the browser).
router.post("/sslcommerz/ipn", async (req: Request, res: Response) => {
  const body = flat(req.body);
  try {
    if (body.tran_id) await verifyAndComplete(body.tran_id, "sslcommerz", body);
  } catch (err) {
    console.error("[sslcommerz ipn]", err);
  }
  res.status(200).send("OK");
});

router.get("/bkash/callback", async (req: Request, res: Response) => {
  const q = flat(req.query as Record<string, unknown>);
  await finish(res, q.tran, "bkash", q);
});

router.get("/stripe/return", async (req: Request, res: Response) => {
  const q = flat(req.query as Record<string, unknown>);
  await finish(res, q.tran, "stripe", q);
});

/**
 * Stripe webhook. Configure in Stripe: {API_PUBLIC_URL}/api/v1/pg/stripe/webhook/platform
 * (or /webhook/<companyId> for an ISP's own Stripe account), event checkout.session.completed.
 * Body is raw (see app.ts) so the signature can be checked.
 */
router.post("/stripe/webhook/:owner", async (req: Request, res: Response) => {
  const ownerParam = String(req.params.owner);
  const owner = ownerParam === "platform" ? null : ownerParam;
  let event: Stripe.Event;
  try {
    const account = await getGatewayAccount(owner, "stripe");
    const secret = account.credentials.webhookSecret;
    if (!secret) return res.status(400).send("Webhook secret not configured");
    event = stripeClient(account).webhooks.constructEvent(req.body as Buffer, str(req.headers["stripe-signature"]), secret);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${(err as Error).message}`);
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    const tranId = session.metadata?.tranId;
    const attempt = tranId ? await PaymentAttempt.findOne({ tranId, gateway: "stripe" }) : null;
    // The event must come from the account that owns this payment.
    const expected = attempt ? accountOwner(attempt) : undefined;
    if (attempt && String(expected ?? "platform") === String(owner ?? "platform")) {
      await verifyAndComplete(attempt.tranId, "stripe", { session_id: session.id }).catch((e) => console.error("[stripe webhook]", e));
    }
  }
  res.json({ received: true });
});

export default router;
