"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import SupportThread from "@/components/support/SupportThread";
import { PRIORITY_COLOR, SUPPORT_STATUS, supportCategoryLabel } from "@/components/support/supportMeta";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi, useApiMutation } from "@/lib/hooks";

export default function SupportTicketPage() {
  const { id } = useParams();
  const [text, setText] = useState("");
  const { data, isLoading, error } = useApi(["support", id], `/support/${id}`);
  const invalidate = [["support", id], "support"];
  const send = useApiMutation(() => api.post(`/support/${id}/messages`, { text }), { invalidate, successToast: false, onSuccess: () => setText("") });
  const close = useApiMutation(() => api.post(`/support/${id}/close`), { invalidate });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const t = data.data;
  const st = SUPPORT_STATUS[t.status];

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={`${t.ref} · ${t.subject}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {supportCategoryLabel[t.category]} <Badge color={PRIORITY_COLOR[t.priority]}>{t.priority}</Badge> <Badge color={st?.color}>{st?.label}</Badge>
          </span>
        }
        actions={
          <>
            <Link href="/dashboard/support" className="text-sm text-primary-700 hover:underline">
              ← All requests
            </Link>
            {t.status !== "closed" && (
              <Button variant="secondary" loading={close.isPending} onClick={() => close.mutate()}>
                Mark resolved
              </Button>
            )}
          </>
        }
      />
      <Card>
        <SupportThread messages={t.messages} mine="isp" />
      </Card>
      <Card title={t.status === "closed" ? "Reply to re-open" : "Reply"}>
        <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        <Button className="mt-3" disabled={text.trim().length < 2} loading={send.isPending} onClick={() => send.mutate()}>
          Send
        </Button>
      </Card>
    </div>
  );
}
