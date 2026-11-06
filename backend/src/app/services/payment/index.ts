import { bkashGateway } from "./bkash.gateway";
import { OnlineGatewayId, PaymentGateway } from "./gateway.types";
import { sslcommerzGateway } from "./sslcommerz.gateway";
import { stripeGateway } from "./stripe.gateway";

const real: Record<OnlineGatewayId, PaymentGateway> = {
  sslcommerz: sslcommerzGateway,
  bkash: bkashGateway,
  stripe: stripeGateway,
};
const overrides: Partial<Record<OnlineGatewayId, PaymentGateway>> = {};

export const getGateway = (id: OnlineGatewayId): PaymentGateway => overrides[id] ?? real[id];

/** Tests replace a gateway with a fake. Pass no implementation to restore. */
export function setGatewayOverride(id: OnlineGatewayId, impl?: PaymentGateway) {
  if (impl) overrides[id] = impl;
  else delete overrides[id];
}
