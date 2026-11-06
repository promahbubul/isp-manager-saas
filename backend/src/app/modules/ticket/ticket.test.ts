import { describe, expect, it } from "vitest";
import { flushBackground } from "../../utils/background";
import { fakeSms } from "../../../tests/fakeSms";
import { api } from "../../../tests/helpers";
import { addStaff, createCustomer, setupIsp } from "../../../tests/isp";

describe("tickets", () => {
  it("full lifecycle: create → assign → comment → solve (SMS to customer) with notifications", async () => {
    const ctx = await setupIsp();
    await api().patch("/api/v1/settings").set(ctx.auth).send({ sms: { autoEvents: { welcome: false } } });
    const c = await createCustomer(ctx);
    const tech = await addStaff(ctx, { phone: "01900000001", role: "technician" });
    const manager = await addStaff(ctx, { phone: "01900000002", role: "manager" });

    const created = await api()
      .post("/api/v1/tickets")
      .set(manager.auth)
      .send({ customer: c.body.data.customer._id, category: "no_internet", subject: "Net nai since morning", priority: "high" });
    expect(created.status).toBe(201);
    const id = created.body.data._id;
    expect(created.body.data.ticketNo).toBe("T-00001");

    // owner (a manager-level role) is notified about the unassigned ticket
    const ownerNotes = await api().get("/api/v1/notifications").set(ctx.auth);
    expect(ownerNotes.body.data.unread).toBe(1);

    const assigned = await api().patch(`/api/v1/tickets/${id}/assign`).set(manager.auth).send({ assignedTo: tech.id });
    expect(assigned.body.data.status).toBe("in_progress");
    const techNotes = await api().get("/api/v1/notifications").set(tech.auth);
    expect(techNotes.body.data.items[0].title).toContain("assigned to you");

    const commented = await api().post(`/api/v1/tickets/${id}/comments`).set(tech.auth).send({ text: "Fiber cut found at box 12" });
    expect(commented.body.data.comments.at(-1).text).toBe("Fiber cut found at box 12");

    const solved = await api().patch(`/api/v1/tickets/${id}/status`).set(tech.auth).send({ status: "solved", note: "Spliced" });
    expect(solved.body.data.solvedAt).toBeTruthy();
    await flushBackground();
    expect(fakeSms.sent.at(-1)?.message).toContain("T-00001");

    const managerNotes = await api().get("/api/v1/notifications").set(manager.auth);
    expect(managerNotes.body.data.items.some((n: { title: string }) => n.title.includes("Solved"))).toBe(true);
  });

  it("technicians only see their own and unassigned tickets", async () => {
    const ctx = await setupIsp();
    const t1 = await addStaff(ctx, { phone: "01900000001", role: "technician" });
    const t2 = await addStaff(ctx, { phone: "01900000003", role: "technician" });
    const a = await api().post("/api/v1/tickets").set(ctx.auth).send({ subject: "Ticket for t1", assignedTo: t1.id });
    await api().post("/api/v1/tickets").set(ctx.auth).send({ subject: "Unassigned one" });

    const list = await api().get("/api/v1/tickets").set(t2.auth);
    expect(list.body.data.map((t: { subject: string }) => t.subject)).toEqual(["Unassigned one"]);
    expect((await api().get(`/api/v1/tickets/${a.body.data._id}`).set(t2.auth)).status).toBe(404);

    // search must not bypass the technician scope
    const search = await api().get("/api/v1/tickets").query({ search: "t1" }).set(t2.auth);
    expect(search.body.meta.total).toBe(0);

    // technicians cannot assign
    expect((await api().patch(`/api/v1/tickets/${a.body.data._id}/assign`).set(t1.auth).send({ assignedTo: t1.id })).status).toBe(403);
  });
});
