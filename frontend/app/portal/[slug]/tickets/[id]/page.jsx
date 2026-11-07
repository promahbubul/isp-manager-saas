"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import PortalShell from "@/components/portal/PortalShell";
import { CATEGORIES } from "@/components/ticket/TicketForm";
import { Badge, Button, Card, ErrorBox, Loading, Textarea } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { usePortal, usePortalMutation } from "@/lib/portalHooks";

const STATUS = { open: ["Received", "red"], in_progress: ["Working on it", "amber"], solved: ["Solved", "green"], closed: ["Closed", "slate"] };
const categoryLabel = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

export default function PortalTicketPage() {
  const { slug, id } = useParams();
  const [text, setText] = useState("");
  const me = usePortal(slug, "me", "/me");
  const { data, isLoading, error } = usePortal(slug, ["ticket", id], `/tickets/${id}`);
  const send = usePortalMutation(slug, (api) => api.post(`/tickets/${id}/comments`, { text }), {
    invalidate: [["ticket", id], "tickets"],
    onSuccess: () => setText(""),
  });

  const isp = me.data?.data?.company;
  if (isLoading) return <Loading />;
  if (error) {
    return (
      <PortalShell isp={isp}>
        <ErrorBox error={error} />
      </PortalShell>
    );
  }
  const t = data.data;
  const [label, color] = STATUS[t.status] ?? [t.status, "slate"];

  return (
    <PortalShell isp={isp}>
      <Link href={`/portal/${slug}/account`} className="mb-3 inline-block text-sm text-purple-700 hover:underline">
        ← My account
      </Link>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{t.subject}</h2>
            <p className="text-sm text-slate-500">
              {t.ticketNo} · {categoryLabel[t.category] ?? t.category} · {t.customer?.name}
            </p>
          </div>
          <Badge color={color}>{label}</Badge>
        </div>
        {t.description && <p className="mt-3 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">{t.description}</p>}
        <ol className="mt-4 space-y-3">
          {t.comments.map((c, i) =>
            c.system ? (
              <li key={i} className="text-xs text-slate-500">
                • {c.text} · {formatDateTime(c.at)}
              </li>
            ) : (
              <li key={i} className={`flex ${c.fromCustomer ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${c.fromCustomer ? "bg-purple-50 ring-1 ring-purple-200" : "bg-emerald-50 ring-1 ring-emerald-200"}`}>
                  <p className="mb-0.5 text-xs text-slate-500">
                    {c.fromCustomer ? "You" : (c.by?.name ?? "Support")} · {formatDateTime(c.at)}
                  </p>
                  <p className="whitespace-pre-wrap">{c.text}</p>
                </div>
              </li>
            ),
          )}
        </ol>
      </Card>
      {t.status !== "closed" && (
        <Card className="mt-4" title={t.status === "solved" ? "Still not working? Tell us" : "Add a message"}>
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <Button className="mt-3 w-full" disabled={!text.trim()} loading={send.isPending} onClick={() => send.mutate()}>
            Send
          </Button>
        </Card>
      )}
    </PortalShell>
  );
}
