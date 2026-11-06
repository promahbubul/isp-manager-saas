import { OnlineGatewayId, PaymentGateway } from "../app/services/payment/gateway.types";
import { setGatewayOverride } from "../app/services/payment";

/**
 * Fake gateway: checkout returns https://fake.pay/<tranId>; verify succeeds when the
 * callback payload has ok=1 (and amount, if given, matches).
 */
export function fakeGateway(id: OnlineGatewayId): PaymentGateway {
  return {
    id,
    async createCheckout(_account, input) {
      return { redirectUrl: `https://fake.pay/${input.tranId}`, gatewayRef: `REF-${input.tranId}` };
    },
    async verify(_account, attempt, payload) {
      if (payload.ok !== "1") return { status: payload.cancel ? "cancelled" : "failed", reason: "declined" };
      if (payload.amount && Number(payload.amount) !== attempt.amount) return { status: "failed", reason: "Amount mismatch" };
      return { status: "success", gatewayTrxId: `TRX-${attempt.tranId.slice(-6)}` };
    },
  };
}

export function installFakeGateways() {
  for (const id of ["sslcommerz", "bkash", "stripe"] as const) setGatewayOverride(id, fakeGateway(id));
}

export function removeFakeGateways() {
  for (const id of ["sslcommerz", "bkash", "stripe"] as const) setGatewayOverride(id);
}
