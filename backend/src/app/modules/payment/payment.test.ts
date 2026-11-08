import { describe, expect, it } from "vitest";
import { api } from "../../../tests/helpers";
import { createCustomer, setupIsp } from "../../../tests/isp";
import { Customer } from "../customer/customer.model";

describe("payment refund", () => {
  it("puts validity and due back, only for the latest payment, once", async () => {
    const isp = await setupIsp();
    const c = await createCustomer(isp);
    const id = c.body.data.customer._id;
    const before = (await Customer.findById(id))!;

    const p1 = await api().post("/api/v1/payments/recharge").set(isp.auth).send({ customer: id, months: 1 }).expect(201);
    const p2 = await api().post("/api/v1/payments/recharge").set(isp.auth).send({ customer: id, months: 2 }).expect(201);
    const afterTwo = (await Customer.findById(id))!;

    // a reason is required
    expect((await api().post(`/api/v1/payments/${p2.body.data.payment._id}/refund`).set(isp.auth).send({})).status).toBe(400);
    // only the latest payment
    expect((await api().post(`/api/v1/payments/${p1.body.data.payment._id}/refund`).set(isp.auth).send({ reason: "Wrong customer" })).status).toBe(400);

    const r = await api().post(`/api/v1/payments/${p2.body.data.payment._id}/refund`).set(isp.auth).send({ reason: "Taken twice" });
    expect(r.status).toBe(200);
    expect(r.body.data.payment).toMatchObject({ status: "refunded", refundReason: "Taken twice" });

    const now = (await Customer.findById(id))!;
    expect(now.expiryDate.getTime()).toBeLessThan(afterTwo.expiryDate.getTime());
    expect(now.expiryDate.toISOString()).toBe(p2.body.data.payment.previousExpiry);
    expect(now.dueAmount).toBe(p2.body.data.payment.previousDue);

    // twice is refused; now the older one is the latest and can be refunded too
    expect((await api().post(`/api/v1/payments/${p2.body.data.payment._id}/refund`).set(isp.auth).send({ reason: "again" })).status).toBe(400);
    await api().post(`/api/v1/payments/${p1.body.data.payment._id}/refund`).set(isp.auth).send({ reason: "Wrong customer" }).expect(200);
    expect((await Customer.findById(id))!.expiryDate.getTime()).toBe(before.expiryDate.getTime());

    // refunded money is not counted
    const list = await api().get("/api/v1/payments").set(isp.auth);
    expect(list.body.totals.amount).toBe(0);
  });
});
