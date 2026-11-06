import { afterEach, describe, expect, it, vi } from "vitest";
import { bkashGateway } from "./bkash.gateway";
import { sslcommerzGateway } from "./sslcommerz.gateway";

/** Adapter-level tests: request shape and response handling, with fetch mocked. */
type Call = { url: string; init?: RequestInit };
function mockFetch(responses: unknown[]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const body = responses.shift();
    return new Response(JSON.stringify(body ?? {}), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

const attempt = { tranId: "SPTEST1", amount: 999, currency: "BDT" as const };
const input = { tranId: "SPTEST1", amount: 999, currency: "BDT" as const, description: "Starter plan", payer: { name: "ISP", phone: "01711000001" } };

describe("SSLCommerz adapter", () => {
  const account = { sandbox: true, credentials: { storeId: "store1", storePassword: "pass1" } };

  it("creates a session with the right fields and returns GatewayPageURL", async () => {
    const calls = mockFetch([{ status: "SUCCESS", GatewayPageURL: "https://sandbox.sslcommerz.com/pay/abc", sessionkey: "SK1" }]);
    const r = await sslcommerzGateway.createCheckout(account, input);
    expect(r).toEqual({ redirectUrl: "https://sandbox.sslcommerz.com/pay/abc", gatewayRef: "SK1" });
    expect(calls[0].url).toBe("https://sandbox.sslcommerz.com/gwprocess/v4/api.php");
    const form = new URLSearchParams(String(calls[0].init?.body));
    expect(form.get("store_id")).toBe("store1");
    expect(form.get("total_amount")).toBe("999.00");
    expect(form.get("tran_id")).toBe("SPTEST1");
    expect(form.get("ipn_url")).toMatch(/\/api\/v1\/pg\/sslcommerz\/ipn$/);
  });

  it("throws with the gateway's reason when session creation fails", async () => {
    mockFetch([{ status: "FAILED", failedreason: "Store Credential Error" }]);
    await expect(sslcommerzGateway.createCheckout(account, input)).rejects.toThrow(/Store Credential Error/);
  });

  it("validates through the validation API and checks tran_id + amount", async () => {
    const calls = mockFetch([{ status: "VALID", tran_id: "SPTEST1", amount: "999.00", currency: "BDT", bank_tran_id: "BT1" }]);
    const ok = await sslcommerzGateway.verify(account, attempt, { val_id: "V1", status: "VALID" });
    expect(ok).toMatchObject({ status: "success", gatewayTrxId: "BT1" });
    expect(calls[0].url).toContain("validationserverAPI.php?val_id=V1&store_id=store1");

    mockFetch([{ status: "VALID", tran_id: "SPTEST1", amount: "10.00", currency: "BDT" }]);
    expect((await sslcommerzGateway.verify(account, attempt, { val_id: "V2", status: "VALID" })).status).toBe("failed");

    mockFetch([{ status: "INVALID_TRANSACTION" }]);
    expect((await sslcommerzGateway.verify(account, attempt, { val_id: "V3", status: "VALID" })).status).toBe("failed");
  });

  it("maps FAILED/CANCELLED without calling the API", async () => {
    const calls = mockFetch([]);
    expect((await sslcommerzGateway.verify(account, attempt, { status: "CANCELLED" })).status).toBe("cancelled");
    expect((await sslcommerzGateway.verify(account, attempt, { status: "FAILED" })).status).toBe("failed");
    expect(calls).toHaveLength(0);
  });
});

describe("bKash adapter", () => {
  const account = { sandbox: true, credentials: { username: "u1", password: "p1", appKey: "k1", appSecret: "s1" } };

  it("grants a token, creates the payment and returns bkashURL", async () => {
    const calls = mockFetch([
      { id_token: "TOKEN1", statusCode: "0000" },
      { statusCode: "0000", paymentID: "PAY1", bkashURL: "https://sandbox.payment.bkash.com/?paymentId=PAY1" },
    ]);
    const r = await bkashGateway.createCheckout(account, input);
    expect(r).toEqual({ redirectUrl: "https://sandbox.payment.bkash.com/?paymentId=PAY1", gatewayRef: "PAY1" });
    expect(calls[0].url).toMatch(/tokenized\.sandbox\.bka\.sh\/.*\/token\/grant$/);
    expect((calls[0].init?.headers as Record<string, string>).username).toBe("u1");
    const create = JSON.parse(String(calls[1].init?.body));
    expect(create).toMatchObject({ mode: "0011", amount: "999.00", currency: "BDT", intent: "sale", merchantInvoiceNumber: "SPTEST1" });
    expect(create.callbackURL).toContain("/pg/bkash/callback?tran=SPTEST1");
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe("TOKEN1");
  });

  it("executes on success and checks invoice + amount", async () => {
    // token is cached from the previous test (same app key)
    mockFetch([{ transactionStatus: "Completed", trxID: "BK123", amount: "999.00", merchantInvoiceNumber: "SPTEST1", statusCode: "0000" }]);
    expect(await bkashGateway.verify(account, { ...attempt, gatewayRef: "PAY1" }, { paymentID: "PAY1", status: "success" })).toMatchObject({
      status: "success",
      gatewayTrxId: "BK123",
    });

    mockFetch([
      { statusCode: "2056", statusMessage: "Invalid Payment State" },
      { transactionStatus: "Completed", trxID: "BK9", amount: "1.00", merchantInvoiceNumber: "SPTEST1" },
    ]);
    expect((await bkashGateway.verify(account, attempt, { paymentID: "PAY1", status: "success" })).status).toBe("failed");
  });

  it("maps cancel / failure callbacks", async () => {
    expect((await bkashGateway.verify(account, attempt, { status: "cancel" })).status).toBe("cancelled");
    expect((await bkashGateway.verify(account, attempt, { status: "failure" })).status).toBe("failed");
  });
});
