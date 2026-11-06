"use client";

import { useState } from "react";
import PermissionGate from "@/components/common/PermissionGate";
import { Button, Card, Checkbox, ErrorBox, Loading, PageHeader, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi, useApiMutation } from "@/lib/hooks";
import { SegmentHint } from "@/lib/sms";

const LABELS = {
  welcome: "Welcome (new connection)",
  payment_success: "Payment received",
  expiry_reminder: "Expiry reminder",
  expired: "Connection expired",
  ticket_update: "Ticket solved",
};

function TemplateCard({ tpl, variables }) {
  const [message, setMessage] = useState(tpl.message);
  const [isActive, setActive] = useState(tpl.isActive);
  const save = useApiMutation((body) => api.put(`/sms/templates/${tpl.event}`, body), { invalidate: ["sms-templates"] });
  const dirty = message !== tpl.message || isActive !== tpl.isActive;

  return (
    <Card title={LABELS[tpl.event] ?? tpl.event}>
      <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
      <SegmentHint text={message} />
      <p className="mt-2 text-xs text-slate-500">
        Variables: {variables.map((v) => <code key={v} className="mr-1 rounded bg-slate-100 px-1">{`{${v}}`}</code>)}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <Checkbox id={`active-${tpl.event}`} label="Enabled" checked={isActive} onChange={(e) => setActive(e.target.checked)} />
        <PermissionGate perm="sms.template">
          <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate({ message, isActive })}>
            Save
          </Button>
        </PermissionGate>
      </div>
    </Card>
  );
}

export default function SmsTemplatesPage() {
  const { data, isLoading, error } = useApi("sms-templates", "/sms/templates");
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { templates, variables } = data.data;
  return (
    <div>
      <PageHeader title="SMS templates" subtitle="Automatic messages. Turn events on/off in Settings → SMS." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {templates.map((t) => (
          <TemplateCard key={`${t.event}-${t.updatedAt}`} tpl={t} variables={variables[t.event] ?? []} />
        ))}
      </div>
    </div>
  );
}
