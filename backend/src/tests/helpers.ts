import request from "supertest";
import app from "../app";

export const api = () => request(app);

let n = 0;
export async function signupTenant(overrides: Record<string, string> = {}) {
  n += 1;
  const body = {
    companyName: `Speed Net ${n}`,
    slug: `speednet-${n}`,
    ownerName: "Owner",
    phone: `0171100${String(n).padStart(4, "0")}`,
    email: `owner${n}@example.com`,
    password: "Secret123",
    ...overrides,
  };
  const res = await api().post("/api/v1/auth/signup").send(body);
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    body,
    token: res.body.data.accessToken as string,
    companyId: res.body.data.company._id as string,
    userId: res.body.data.user._id as string,
    cookies: res.headers["set-cookie"] as unknown as string[],
  };
}
