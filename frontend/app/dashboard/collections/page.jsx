"use client";

import { useState } from "react";
import QuickForm from "@/components/common/QuickForm";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, Pagination, Stat, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime, taka } from "@/lib/format";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

const COLOR = { pending: "amber", accepted: "green", rejected: "red" };

export default function CollectionsPage() {
  const { user, can } = useAuth();
  const [handing, setHanding] = useState(false);
  const [page, setPage] = useState(1);
  const me = useApi("my-cash", "/collections/me");
  const summary = useApi("cash-summary", "/collections/summary", undefined, { enabled: can("collection.view") });
  const receivers = useApi("cash-receivers", "/collections/receivers", undefined, { enabled: handing });
  const handovers = useApi(["handovers", page], "/collections/handovers", { page, limit: 25 });
  const inv = ["my-cash", "cash-summary", "handovers"];
  const give = useApiMutation((b) => api.post("/collections/handovers", b), { invalidate: inv });
  const decide = useApiMutation(({ id, accept }) => api.post(`/collections/handovers/${id}/decide`, { accept }), { invalidate: inv });
  const m = me.data?.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash collection"
        subtitle="Cash taken from customers, and handing it over to the office"
        actions={
          can("collection.handover") && (
            <Button disabled={!m?.inHand} onClick={() => setHanding(true)}>
              Hand over cash
            </Button>
          )
        }
      />
      {m && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Cash in my hand" value={taka(m.inHand)} tone="amber" />
          <Stat label="Collected (all time)" value={taka(m.collected)} />
          <Stat label="Received from others" value={taka(m.received)} />
          <Stat label="Handed over" value={`${taka(m.handedOver)}${m.pendingOut ? ` (${taka(m.pendingOut)} waiting)` : ""}`} />
        </div>
      )}

      {can("collection.view") && (
        <Card title="Cash in hand by staff">
          {summary.isLoading ? (
            <Loading />
          ) : summary.error ? (
            <ErrorBox error={summary.error} />
          ) : (
            <Table
              rowKey="key"
              rows={(summary.data?.data ?? []).map((r) => ({ ...r, key: r.user._id }))}
              empty="No cash collected yet."
              columns={[
                { key: "name", header: "Staff", render: (r) => `${r.user.name}${r.user.role ? ` (${r.user.role})` : ""}` },
                { key: "collected", header: "Collected", render: (r) => taka(r.collected) },
                { key: "received", header: "Received", render: (r) => taka(r.received) },
                { key: "handedOver", header: "Handed over", render: (r) => taka(r.handedOver) },
                { key: "inHand", header: "In hand", render: (r) => <strong>{taka(r.inHand)}</strong> },
              ]}
            />
          )}
        </Card>
      )}

      <Card title="Handovers">
        {handovers.isLoading ? (
          <Loading />
        ) : (
          <>
            <Table
              rows={handovers.data?.data ?? []}
              empty="No handovers."
              columns={[
                { key: "createdAt", header: "Time", render: (h) => formatDateTime(h.createdAt) },
                { key: "from", header: "From", render: (h) => h.from?.name },
                { key: "to", header: "To", render: (h) => h.to?.name },
                { key: "amount", header: "Amount", render: (h) => taka(h.amount) },
                { key: "note", header: "Note", className: "max-w-xs truncate" },
                { key: "status", header: "Status", render: (h) => <Badge color={COLOR[h.status]}>{h.status}</Badge> },
                {
                  key: "act",
                  header: "",
                  render: (h) =>
                    h.status === "pending" &&
                    (h.to?._id === user?._id || user?.role === "owner" || user?.role === "admin") && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="success" onClick={() => decide.mutate({ id: h._id, accept: true })}>
                          Received
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => decide.mutate({ id: h._id, accept: false })}>
                          Reject
                        </Button>
                      </div>
                    ),
                },
              ]}
            />
            <Pagination meta={handovers.data?.meta} onPage={setPage} />
          </>
        )}
      </Card>

      {handing && (
        <QuickForm
          title="Hand over cash"
          submitLabel="Send"
          loading={give.isPending}
          initial={{ amount: m?.inHand ?? "" }}
          fields={[
            { name: "to", label: "Give to", type: "select", required: true, placeholder: "— choose —", options: (receivers.data?.data ?? []).map((u) => ({ value: u._id, label: `${u.name} (${u.role})` })) },
            { name: "amount", label: "Amount (৳)", type: "number", required: true, hint: `In hand: ${taka(m?.inHand ?? 0)}` },
            { name: "note", label: "Note" },
          ]}
          onSubmit={(v) => give.mutateAsync(v)}
          onClose={() => setHanding(false)}
        />
      )}
    </div>
  );
}
