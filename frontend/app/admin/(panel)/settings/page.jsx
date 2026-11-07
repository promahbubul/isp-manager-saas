"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button, Card, Checkbox, ErrorBox, Input, Loading, PageHeader } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminApi, useAdminMutation } from "@/lib/adminHooks";

export default function AdminSettingsPage() {
  const { data, isLoading, error } = useAdminApi("settings", "/admin/settings");
  const { register, handleSubmit, reset } = useForm();
  const save = useAdminMutation((body) => adminApi.patch("/admin/settings", body), { invalidate: ["settings"] });
  const [testTo, setTestTo] = useState("");
  const test = useAdminMutation(() => adminApi.post("/admin/settings/test-email", { to: testTo }));

  useEffect(() => {
    if (data?.data) reset({ ...data.data, smtp: { ...(data.data.smtp ?? {}), pass: "" } });
  }, [data, reset]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  return (
    <div>
      <PageHeader title="Platform settings" />
      <form
        onSubmit={handleSubmit((v) =>
          save.mutate({
            smsCreditPriceBDT: Number(v.smsCreditPriceBDT),
            smsCreditPriceUSD: Number(v.smsCreditPriceUSD),
            graceDays: Number(v.graceDays),
            smtp: { enabled: Boolean(v.smtp?.enabled), host: v.smtp?.host || undefined, port: v.smtp?.port ? Number(v.smtp.port) : undefined, user: v.smtp?.user || undefined, pass: v.smtp?.pass || undefined, from: v.smtp?.from || undefined },
          }),
        )}
        className="max-w-xl space-y-6"
      >
        <Card title="SMS credit price">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Per credit (৳)" type="number" step="0.01" {...register("smsCreditPriceBDT")} />
            <Input label="Per credit ($, Stripe)" type="number" step="0.0001" {...register("smsCreditPriceUSD")} />
          </div>
        </Card>
        <Card title="Subscription">
          <Input label="Grace days after a period ends" hint="ISPs stay writable (past due) for this many days, then get suspended" type="number" {...register("graceDays")} />
        </Card>
        <Card title="Email (SMTP)">
          <p className="mb-3 text-sm text-zinc-600">Used for ISP daily summaries and subscription reminders. Any SMTP works (Gmail app password, Zoho, Amazon SES, Brevo).</p>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Host" placeholder="smtp.gmail.com" {...register("smtp.host")} />
            <Input label="Port" type="number" placeholder="587" {...register("smtp.port")} />
            <Input label="Username" {...register("smtp.user")} />
            <Input label="Password" type="password" placeholder={data.data.smtpHasPassword ? "•••• saved" : ""} {...register("smtp.pass")} />
            <Input label="From" className="col-span-2" placeholder="ISP Manager <no-reply@yourdomain.com>" {...register("smtp.from")} />
            <Checkbox label="Send emails" {...register("smtp.enabled")} />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <Input label="Send a test to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <Button type="button" variant="secondary" loading={test.isPending} disabled={!testTo} onClick={() => test.mutate()}>
              Send test
            </Button>
          </div>
        </Card>
        <Button type="submit" loading={save.isPending}>
          Save
        </Button>
      </form>
    </div>
  );
}
