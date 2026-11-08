import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildXlsx } from "../../services/excel/excel.service";
import { flushBackground } from "../../utils/background";
import { fakeRouter } from "../../../tests/fakeRouter";
import { api } from "../../../tests/helpers";
import { createCustomer, DAY, setupIsp } from "../../../tests/isp";
import { Customer } from "../customer/customer.model";

const binary = (res: { on: (e: string, cb: (c?: Buffer) => void) => void; setEncoding: (e: string) => void }, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c?: Buffer) => c && chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

describe("reports", () => {
  it("collection report groups by method; due report lists customers with due", async () => {
    const ctx = await setupIsp();
    const a = await createCustomer(ctx);
    const b = await createCustomer(ctx, { name: "Karim", phone: "01711000002", pppoeUsername: "karim" });
    await api().post("/api/v1/payments/recharge").set(ctx.auth).send({ customer: a.body.data.customer._id });
    await api()
      .post("/api/v1/payments/recharge")
      .set(ctx.auth)
      .send({ customer: b.body.data.customer._id, amount: 200, method: "bkash", trxId: "TX1" });

    const col = await api().get("/api/v1/reports/collection").query({ groupBy: "method" }).set(ctx.auth);
    expect(col.status).toBe(200);
    expect(col.body.data.rows).toEqual([
      { group: "bkash", count: 1, amount: 200 },
      { group: "cash", count: 1, amount: 500 },
    ]);
    expect(col.body.data.summary[0].value).toBe(700);

    const byCollector = await api().get("/api/v1/reports/collection").query({ groupBy: "collector" }).set(ctx.auth);
    expect(byCollector.body.data.rows[0].group).toBe("Owner");

    const due = await api().get("/api/v1/reports/due").set(ctx.auth);
    expect(due.body.data.rows).toHaveLength(1);
    expect(due.body.data.rows[0]).toMatchObject({ name: "Karim", dueAmount: 300 });

    const pkg = await api().get("/api/v1/reports/package-wise").set(ctx.auth);
    expect(pkg.body.data.rows[0]).toMatchObject({ package: "10 Mbps", active: 2, revenue: 1000 });
  });

  it("lists payments, income/expense entries and invoices", async () => {
    const ctx = await setupIsp();
    const a = await createCustomer(ctx);
    await api().post("/api/v1/payments/recharge").set(ctx.auth).send({ customer: a.body.data.customer._id, amount: 200, method: "bkash", trxId: "TX9" });
    await api().post("/api/v1/accounts/entries").set(ctx.auth).send({ type: "expense", category: "Bandwidth", amount: 150, date: new Date() }).expect(201);

    const pays = await api().get("/api/v1/reports/payments").query({ method: "bkash" }).set(ctx.auth);
    expect(pays.status).toBe(200);
    expect(pays.body.data.rows).toHaveLength(1);
    expect(pays.body.data.rows[0]).toMatchObject({ customer: "Rahim Uddin", method: "bkash", trxId: "TX9", amount: 200, receivedBy: "Owner" });
    expect((await api().get("/api/v1/reports/payments").query({ method: "cash" }).set(ctx.auth)).body.data.rows).toHaveLength(0);

    const exp = await api().get("/api/v1/reports/expenses").set(ctx.auth);
    expect(exp.body.data.rows[0]).toMatchObject({ type: "expense", category: "Bandwidth", amount: 150 });
    expect(exp.body.data.summary[1].value).toBe(150);

    const inv = await api().get("/api/v1/reports/invoices").set(ctx.auth);
    expect(inv.status).toBe(200);
    expect(inv.body.data.rows).toEqual([]);
  });

  it("exports a report as xlsx", async () => {
    const ctx = await setupIsp();
    await createCustomer(ctx);
    const res = await api().get("/api/v1/reports/expired").query({ format: "xlsx" }).set(ctx.auth).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    expect(wb.worksheets[0].getRow(2).getCell(2).value).toBe("Rahim Uddin");
  });
});

describe("customer import / export", () => {
  async function sheet(rows: Record<string, unknown>[]) {
    const cols = Object.keys(rows[0]).map((k) => ({ header: k, key: k }));
    return buildXlsx("Customers", cols, rows);
  }

  it("dry-run reports row errors; commit creates valid rows and syncs them to MikroTik", async () => {
    const ctx = await setupIsp();
    await createCustomer(ctx); // "rahim" already exists
    const file = await sheet([
      { name: "Alice", phone: "01711000005", pppoe_username: "alice", pppoe_password: "pass1234", package: "10 mbps", zone: "Mirpur", expiry_date: "31/12/2030" },
      { name: "Bob", phone: "123", pppoe_username: "bob", package: "No Such Plan" },
      { name: "Dup", phone: "01711000006", pppoe_username: "rahim", package: "10 Mbps" },
      { name: "Bad date", pppoe_username: "baddate", package: "10 Mbps", expiry_date: "31/02/2030" },
    ]);

    const dry = await api().post("/api/v1/customers/import").set(ctx.auth).attach("file", file, "c.xlsx");
    expect(dry.status).toBe(200);
    expect(dry.body.data).toMatchObject({ total: 4, valid: 1, invalid: 3, created: 0 });
    const errs = dry.body.data.errors.map((e: { row: number; errors: string[] }) => [e.row, e.errors.join("; ")]);
    expect(errs[0][1]).toMatch(/phone.*package/s);
    expect(errs[1][1]).toMatch(/already exists/);
    expect(errs[2][1]).toMatch(/expiry_date/);

    const commit = await api().post("/api/v1/customers/import?commit=true").set(ctx.auth).attach("file", file, "c.xlsx");
    expect(commit.body.data.created).toBe(1);
    await flushBackground();
    const alice = await Customer.findOne({ "pppoe.username": "alice" });
    expect(alice?.status).toBe("active");
    expect(alice?.syncStatus).toBe("synced");
    expect(fakeRouter(ctx.host).secrets.get("alice")).toMatchObject({ password: "pass1234", profile: "10M", disabled: false });
  });

  it("rejects non-xlsx uploads", async () => {
    const ctx = await setupIsp();
    const res = await api().post("/api/v1/customers/import").set(ctx.auth).attach("file", Buffer.from("a,b"), "c.csv");
    expect(res.status).toBe(400);
  });

  it("exports customers to xlsx", async () => {
    const ctx = await setupIsp();
    await createCustomer(ctx);
    const res = await api().get("/api/v1/customers/export").set(ctx.auth).buffer(true).parse(binary);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).getCell(4).value).toBe("pppoe_username");
    expect(ws.getRow(2).getCell(4).value).toBe("rahim");
  });

  it("imports existing PPP secrets from MikroTik without changing them", async () => {
    const ctx = await setupIsp();
    const r = fakeRouter(ctx.host);
    r.secrets.set("old1", { name: "old1", password: "p-old1", profile: "10M", service: "pppoe", disabled: false, comment: "Old Customer" });
    r.secrets.set("old2", { name: "old2", password: "p-old2", profile: "10M", service: "pppoe", disabled: true });
    r.secrets.set("nopass", { name: "nopass", profile: "10M", service: "pppoe", disabled: false });

    const preview = await api().get(`/api/v1/customers/import/mikrotik/${ctx.routerId}`).set(ctx.auth);
    expect(preview.body.data.secrets).toHaveLength(3);
    expect(preview.body.data.secrets[0].suggestedPackage).toBe(ctx.packageId);

    const res = await api()
      .post(`/api/v1/customers/import/mikrotik/${ctx.routerId}`)
      .set(ctx.auth)
      .send({
        expiryDate: new Date(Date.now() + 10 * DAY),
        items: ["old1", "old2", "nopass"].map((username) => ({ username, package: ctx.packageId })),
      });
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.errors[0].error).toMatch(/sensitive/);
    await flushBackground();

    const old1 = await Customer.findOne({ "pppoe.username": "old1" });
    expect(old1).toMatchObject({ name: "Old Customer", status: "active", syncStatus: "synced" });
    const old2 = await Customer.findOne({ "pppoe.username": "old2" });
    expect(old2?.status).toBe("disabled");
    expect(r.secrets.get("old1")?.password).toBe("p-old1"); // untouched

    // importing again reports duplicates
    const again = await api()
      .post(`/api/v1/customers/import/mikrotik/${ctx.routerId}`)
      .set(ctx.auth)
      .send({ expiryDate: new Date(), items: [{ username: "old1", package: ctx.packageId }] });
    expect(again.body.data.errors[0].error).toBe("Already imported");
  });
});

describe("activity log", () => {
  it("records who did what", async () => {
    const ctx = await setupIsp();
    const c = await createCustomer(ctx);
    await api().post("/api/v1/payments/recharge").set(ctx.auth).send({ customer: c.body.data.customer._id });
    await api().get(`/api/v1/customers/${c.body.data.customer._id}/credentials`).set(ctx.auth);
    await new Promise((r) => setTimeout(r, 100)); // logs are written after the response

    const logs = await api().get("/api/v1/activity-logs").set(ctx.auth);
    const actions = logs.body.data.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["router.create", "package.create", "customer.create", "payment.recharge", "customer.view_password"]));
    const recharge = logs.body.data.find((l: { action: string }) => l.action === "payment.recharge");
    expect(recharge.user.name).toBe("Owner");
    expect(recharge.entityId).toBeTruthy();
  });
});
