"use client";

import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import PortalShell from "@/components/portal/PortalShell";
import { CATEGORIES } from "@/components/ticket/TicketForm";
import { Badge, Button, ErrorBox, Loading, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { usePortal, usePortalMutation } from "@/lib/portalHooks";
import { portalApi } from "@/lib/portalApi";
import TicketAttachments from "@/components/ticket/TicketAttachments";

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
      <Link href={`/portal/${slug}/account`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> My account
      </Link>

      <section className="rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b border-line p-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-semibold leading-snug text-ink">{t.subject}</h1>
            <Badge color={color} dot>
              {label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {t.ticketNo} · {categoryLabel[t.category] ?? t.category} · {t.customer?.name}
          </p>
          {t.description && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-subtle p-3 text-sm text-ink">{t.description}</p>}
        </div>

        <ol className="space-y-4 p-5">
          {t.comments.length === 0 && <li className="py-2 text-center text-sm text-muted">No replies yet — we will update you here.</li>}
          {t.comments.map((c, i) =>
            c.system ? (
              <li key={i} className="flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" />
                <span className="text-center">
                  {c.text} · {formatDateTime(c.at)}
                </span>
                <span className="h-px flex-1 bg-line" />
              </li>
            ) : (
              <li key={i} className={cn("flex", c.fromCustomer ? "justify-end" : "justify-start")}>
                <div className="max-w-[85%]">
                  <p className={cn("mb-1 text-xs text-muted", c.fromCustomer && "text-right")}>
                    {c.fromCustomer ? "You" : (c.by?.name ?? "Support")} · {formatDateTime(c.at)}
                  </p>
                  <div className={cn("whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm", c.fromCustomer ? "rounded-br-md bg-[var(--brand)] text-white" : "rounded-bl-md bg-subtle text-ink")}>{c.text}</div>
                </div>
              </li>
            ),
          )}
        </ol>
      </section>

      <div className="mt-4">
        <TicketAttachments ticket={t} client={portalApi(slug)} queryKey={["portal", slug, "ticket", id]} />
      </div>

      {t.status !== "closed" && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
          <p className="mb-2 text-sm font-medium text-ink">{t.status === "solved" ? "Still not working? Tell us" : "Add a message"}</p>
          <Textarea aria-label="Message" rows={3} placeholder="Write your message…" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-3 flex justify-end">
            <Button disabled={!text.trim()} loading={send.isPending} onClick={() => send.mutate()}>
              <Send /> Send
            </Button>
          </div>
        </section>
      )}
    </PortalShell>
  );
}
