export const GATEWAY_IDS = ["sslcommerz", "bkash", "stripe", "manual"] as const;
export type GatewayId = (typeof GATEWAY_IDS)[number];
export type OnlineGatewayId = Exclude<GatewayId, "manual">;

export type Currency = "BDT" | "USD";

/** Decrypted credentials of one gateway account (platform's or an ISP's). */
export type GatewayCredentials = Record<string, string>;

export type GatewayAccount = { credentials: GatewayCredentials; sandbox: boolean };

export type CheckoutInput = {
  tranId: string;
  amount: number;
  currency: Currency;
  description: string;
  payer: { name: string; email?: string; phone?: string };
};

export type CheckoutResult = { redirectUrl: string; gatewayRef?: string };

export type VerifyResult = {
  status: "success" | "failed" | "cancelled";
  /** gateway's transaction id shown on receipts (bKash trxID, SSLCommerz bank_tran_id, Stripe payment intent) */
  gatewayTrxId?: string;
  reason?: string;
  raw?: unknown;
};

export type AttemptForVerify = { tranId: string; amount: number; currency: Currency; gatewayRef?: string };

export interface PaymentGateway {
  id: OnlineGatewayId;
  createCheckout(account: GatewayAccount, input: CheckoutInput): Promise<CheckoutResult>;
  /** Confirm with the gateway's server — never trust the browser redirect alone. */
  verify(account: GatewayAccount, attempt: AttemptForVerify, payload: Record<string, string>): Promise<VerifyResult>;
}

/** Field definitions drive both validation and the settings UI. */
export type GatewayField = { key: string; label: string; secret: boolean; required: boolean; help?: string };

export const GATEWAY_META: Record<GatewayId, { label: string; currencies: Currency[]; fields: GatewayField[]; help: string }> = {
  sslcommerz: {
    label: "SSLCommerz (cards, bKash, Nagad, Rocket, net banking)",
    currencies: ["BDT", "USD"],
    help: "Merchant panel → Store ID and Store Password (API). Sandbox: register at developer.sslcommerz.com.",
    fields: [
      { key: "storeId", label: "Store ID", secret: false, required: true },
      { key: "storePassword", label: "Store password", secret: true, required: true },
    ],
  },
  bkash: {
    label: "bKash (Tokenized Checkout)",
    currencies: ["BDT"],
    help: "Credentials from bKash PGW merchant onboarding (username, password, app key, app secret).",
    fields: [
      { key: "username", label: "Username", secret: false, required: true },
      { key: "password", label: "Password", secret: true, required: true },
      { key: "appKey", label: "App key", secret: false, required: true },
      { key: "appSecret", label: "App secret", secret: true, required: true },
    ],
  },
  stripe: {
    label: "Stripe (international cards)",
    currencies: ["USD", "BDT"],
    help: "Dashboard → Developers → API keys. Webhook (optional, recommended): checkout.session.completed.",
    fields: [
      { key: "secretKey", label: "Secret key (sk_...)", secret: true, required: true },
      { key: "webhookSecret", label: "Webhook signing secret (whsec_...)", secret: true, required: false },
    ],
  },
  manual: {
    label: "Manual (bKash/Nagad Send Money, bank) — verified by staff",
    currencies: ["BDT"],
    help: "Payer sends money and enters the transaction ID; you approve it after checking your statement.",
    fields: [],
  },
};
