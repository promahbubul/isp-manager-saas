import crypto from "crypto";
import { Types } from "mongoose";
import config from "../../config";
import AppError from "../../errors/AppError";
import { getGateway } from "../../services/payment";
import { Currency, GATEWAY_META, GatewayId, OnlineGatewayId, VerifyResult } from "../../services/payment/gateway.types";
import { runWithTenant } from "../../utils/tenantContext";
import { getGatewayAccount } from "../paymentGateway/gatewayConfig.service";
import { IPaymentAttempt, PaymentAttempt, PaymentAttemptDoc, PaymentScope } from "./paymentAttempt.model";

/* ───────────── fulfilment registry (avoids import cycles) ───────────── */

export type Fulfiller = (attempt: PaymentAttemptDoc) => Promise<void>;
export type FailureHandler = (attempt: PaymentAttemptDoc) => Promise<void>;
const fulfillers: Partial<Record<PaymentScope, Fulfiller>> = {};
const failureHandlers: Partial<Record<PaymentScope, FailureHandler>> = {};

export function registerFulfiller(scope: PaymentScope, fn: Fulfiller, onFailure?: FailureHandler) {
  fulfillers[scope] = fn;
  if (onFailure) failureHandlers[scope] = onFailure;
}

/** Platform scopes pay the platform's account; customer bills pay the ISP's account. */
export const accountOwner = (a: Pick<IPaymentAttempt, "scope" | "company">) =>
  a.scope === "customer_bill" ? a.company : null;

export const newTranId = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`.toUpperCase();

type StartInput = {
  scope: PaymentScope;
  company: string | Types.ObjectId;
  gateway: GatewayId;
  amount: number;
  currency: Currency;
  description: string;
  payer: IPaymentAttempt["payer"];
  refs: IPaymentAttempt["refs"];
  returnPath: string;
  initiatedBy?: string;
  /** manual only */
  manual?: { trxId: string; method?: string; senderNumber?: string; note?: string };
};

/**
 * Start a payment. Online gateways return a redirect URL; manual payments are
 * stored as pending_review for staff/super-admin approval.
 */
export async function startPayment(input: StartInput): Promise<{ attempt: PaymentAttemptDoc; redirectUrl?: string }> {
  if (!(input.amount > 0)) throw new AppError(400, "Nothing to pay");
  const owner = accountOwner({ scope: input.scope, company: new Types.ObjectId(String(input.company)) });
  const account = await getGatewayAccount(owner, input.gateway); // throws if disabled

  const base = {
    tranId: newTranId(input.scope === "customer_bill" ? "CB" : "SP"),
    scope: input.scope,
    company: input.company,
    gateway: input.gateway,
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    payer: input.payer,
    refs: input.refs,
    returnPath: input.returnPath,
    initiatedBy: input.initiatedBy,
  };

  if (input.gateway === "manual") {
    if (!input.manual?.trxId) throw new AppError(400, "Transaction ID is required for manual payments");
    try {
      const attempt = await PaymentAttempt.create({
        ...base,
        status: "pending_review",
        gatewayTrxId: input.manual.trxId.trim().toUpperCase(),
        manual: { method: input.manual.method, senderNumber: input.manual.senderNumber, note: input.manual.note },
      });
      return { attempt };
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new AppError(409, "This transaction ID has already been submitted");
      throw err;
    }
  }

  const gw = getGateway(input.gateway as OnlineGatewayId);
  if (!GATEWAY_META[input.gateway].currencies.includes(input.currency)) {
    throw new AppError(400, `${input.gateway} does not accept ${input.currency}`);
  }
  const attempt = await PaymentAttempt.create(base);
  try {
    const { redirectUrl, gatewayRef } = await gw.createCheckout(account, {
      tranId: attempt.tranId,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      payer: { name: input.payer.name ?? "Customer", email: input.payer.email, phone: input.payer.phone },
    });
    attempt.gatewayRef = gatewayRef;
    await attempt.save();
    return { attempt, redirectUrl };
  } catch (err) {
    attempt.set({ status: "failed", failureReason: (err as Error).message });
    await attempt.save();
    throw new AppError(502, `Could not start payment: ${(err as Error).message}`);
  }
}

/**
 * Apply a verified result exactly once. The status flip from initiated/pending_review
 * is atomic, so duplicate IPNs/webhooks/redirects cannot grant twice.
 */
export async function completeAttempt(attempt: PaymentAttemptDoc, result: VerifyResult, reviewer?: string) {
  const from: IPaymentAttempt["status"][] = ["initiated", "pending_review"];
  const updated = (await PaymentAttempt.findOneAndUpdate(
    { _id: attempt._id, status: { $in: from } } as Record<string, unknown>,
    {
      $set: {
        status: result.status,
        completedAt: new Date(),
        ...(result.gatewayTrxId ? { gatewayTrxId: result.gatewayTrxId } : {}),
        ...(result.reason ? { failureReason: result.reason } : {}),
        ...(reviewer ? { reviewedBy: reviewer } : {}),
        raw: result.raw,
      },
    },
    { returnDocument: "after" },
  )) as PaymentAttemptDoc | null;
  if (!updated) return (await PaymentAttempt.findById(attempt._id))!; // already processed

  await runWithTenant(String(updated.company), async () => {
    if (result.status === "success") {
      const fn = fulfillers[updated.scope];
      if (!fn) throw new Error(`No fulfiller for ${updated.scope}`);
      await fn(updated);
    } else {
      await failureHandlers[updated.scope]?.(updated);
    }
  });
  return updated;
}

/** Called from gateway return/IPN/webhook routes. */
export async function verifyAndComplete(tranId: string, gateway: OnlineGatewayId, payload: Record<string, string>) {
  const attempt = await PaymentAttempt.findOne({ tranId, gateway });
  if (!attempt) throw new AppError(404, "Payment not found");
  if (attempt.status !== "initiated") return attempt; // already final

  const account = await getGatewayAccount(accountOwner(attempt), gateway).catch(() => null);
  if (!account) return completeAttempt(attempt, { status: "failed", reason: "Gateway is disabled" });

  let result: VerifyResult;
  try {
    result = await getGateway(gateway).verify(account, attempt, payload);
  } catch (err) {
    // Network problem talking to the gateway: leave it initiated so IPN/webhook or a retry can finish it.
    console.error(`[payment] verify ${tranId} failed:`, err);
    return attempt;
  }
  return completeAttempt(attempt, result);
}

/** Manual approval (ISP staff for customer bills, super admin for platform payments). */
export async function reviewManual(attemptId: string, approve: boolean, reviewer: string, reason?: string, companyScope?: string) {
  const attempt = await PaymentAttempt.findOne({
    _id: attemptId,
    gateway: "manual",
    ...(companyScope ? { company: companyScope, scope: "customer_bill" } : { scope: { $ne: "customer_bill" } }),
  });
  if (!attempt) throw new AppError(404, "Payment not found");
  if (attempt.status !== "pending_review") throw new AppError(400, `Payment is already ${attempt.status}`);
  return completeAttempt(
    attempt,
    approve ? { status: "success", gatewayTrxId: attempt.gatewayTrxId } : { status: "failed", reason: reason || "Rejected by reviewer" },
    reviewer,
  );
}

/** Where to send the browser after a gateway return. */
export function resultRedirect(attempt: Pick<IPaymentAttempt, "returnPath" | "tranId" | "status">) {
  const status = attempt.status === "success" ? "success" : attempt.status === "initiated" ? "processing" : attempt.status;
  const sep = attempt.returnPath.includes("?") ? "&" : "?";
  return `${config.appUrl}${attempt.returnPath}${sep}payment=${status}&tran=${encodeURIComponent(attempt.tranId)}`;
}
