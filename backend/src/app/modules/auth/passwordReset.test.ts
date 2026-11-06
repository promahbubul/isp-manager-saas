import { describe, expect, it } from "vitest";
import { fakeSms } from "../../../tests/fakeSms";
import { api, signupTenant } from "../../../tests/helpers";
import { Otp } from "./otp.model";

const codeFromSms = () => /(\d{6})/.exec(fakeSms.sent.at(-1)?.message ?? "")?.[1];

describe("forgot / reset password", () => {
  it("sends a code by SMS (not from the ISP wallet) and resets the password", async () => {
    const t = await signupTenant();
    const req = await api().post("/api/v1/auth/forgot-password").send({ identifier: t.body.email });
    expect(req.status).toBe(200);
    expect(req.body.data.sentTo).toMatch(/^017\*{5}\d{3}$/);
    const code = codeFromSms();
    expect(code).toBeTruthy();
    expect((await Otp.findOne())!.codeHash).not.toContain(code!); // stored hashed

    const reset = await api()
      .post("/api/v1/auth/reset-password")
      .send({ identifier: t.body.phone, code, newPassword: "Brand9new" });
    expect(reset.status).toBe(200);

    // old sessions are gone, new password works, code cannot be reused
    expect((await api().post("/api/v1/auth/refresh-token").set("Cookie", t.cookies)).status).toBe(401);
    expect((await api().post("/api/v1/auth/login").send({ identifier: t.body.email, password: "Brand9new" })).status).toBe(200);
    expect((await api().post("/api/v1/auth/reset-password").send({ identifier: t.body.phone, code, newPassword: "Another9x" })).status).toBe(400);
  });

  it("does not reveal unknown accounts and rate-limits resends", async () => {
    const unknown = await api().post("/api/v1/auth/forgot-password").send({ identifier: "01999999999" });
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.sentTo).toBeUndefined();
    expect(fakeSms.sent).toHaveLength(0);

    const t = await signupTenant();
    await api().post("/api/v1/auth/forgot-password").send({ identifier: t.body.phone });
    expect((await api().post("/api/v1/auth/forgot-password").send({ identifier: t.body.phone })).status).toBe(429);
  });

  it("locks the code after 5 wrong tries", async () => {
    const t = await signupTenant();
    await api().post("/api/v1/auth/forgot-password").send({ identifier: t.body.phone });
    const code = codeFromSms()!;
    for (let i = 0; i < 5; i++) {
      const wrong = String((Number(code) + 1 + i) % 1_000_000).padStart(6, "0");
      expect((await api().post("/api/v1/auth/reset-password").send({ identifier: t.body.phone, code: wrong, newPassword: "Brand9new" })).status).toBe(400);
    }
    const locked = await api().post("/api/v1/auth/reset-password").send({ identifier: t.body.phone, code, newPassword: "Brand9new" });
    expect(locked.status).toBe(429);
  });
});
