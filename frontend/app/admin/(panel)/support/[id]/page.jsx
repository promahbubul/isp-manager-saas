"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import SupportThread from "@/components/support/SupportThread";
import { PRIORITY_COLOR, SUPPORT_STATUS, supportCategoryLabel } from "@/components/support/supportMeta";
import { Badge, Button, Card, ErrorBox, InfoList, Loading, PageHeader, Textarea } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminApi, useAdminMutation } from "@/lib/adminHooks";
import { formatDateTime } from "@/lib/format";

export default function AdminSupportTicketPage() {
  const { id } = useParams();
  const [text, setText] = useState("");
  const { data, isLoading, error } = useAdminApi(["support", id], `/admin/support-tickets/${id}`);
  const invalidate = [["support", id], "support"];
  const reply = useAdminMutation((close) => adminApi.post(`/admin/support-tickets/${id}/reply`, { text, close }), { invalidate, onSuccess: () => setText("") });
  const status = useAdminMutation((s) => adminApi.patch(`/admin/support-tickets/${id}/status`, { status: s }), { invalidate });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const t = data.data;
  const st = SUPPORT_STATUS[t.status];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t.ref} · ${t.subject}`}
        subtitle={`Opened ${formatDateTime(t.createdAt)}`}
        actions={
          <>
            <Link href="/admin/support" className="self-center text-sm text-purple-700 hover:underline">
              ← All tickets
            </Link>
            {t.status === "closed" ? (
              <Button variant="secondary" onClick={() => status.mutate("open")}>
                Re-open
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => status.mutate("closed")}>
                Close without reply
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <SupportThread messages={t.messages} mine="platform" />
          </Card>
          <Card title="Reply to the ISP">
            <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} hint="The ISP gets an in-app notification." />
            <div className="mt-3 flex gap-2">
              <Button disabled={text.trim().length < 2} loading={reply.isPending} onClick={() => reply.mutate(false)}>
                Send reply
              </Button>
              <Button variant="secondary" disabled={text.trim().length < 2 || reply.isPending} onClick={() => reply.mutate(true)}>
                Send &amp; close
              </Button>
            </div>
          </Card>
        </div>
        <Card title="Details">
          <InfoList
            items={[
              { label: "ISP", value: t.company ? <Link className="text-purple-700 hover:underline" href={`/admin/companies/${t.company._id}`}>{t.company.name}</Link> : "—" },
              { label: "ISP status", value: t.company?.status },
              { label: "Opened by", value: t.openedBy ? `${t.openedBy.name} (${t.openedBy.role})` : "—" },
              { label: "Mobile", value: t.openedBy?.phone ? <a className="text-purple-700" href={`tel:${t.openedBy.phone}`}>{t.openedBy.phone}</a> : "—" },
              { label: "Category", value: supportCategoryLabel[t.category] },
              { label: "Priority", value: <Badge color={PRIORITY_COLOR[t.priority]}>{t.priority}</Badge> },
              { label: "Status", value: <Badge color={st?.color}>{t.status === "open" ? "Waiting for us" : st?.label}</Badge> },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
